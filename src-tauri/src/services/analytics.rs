//! Análises determinísticas. Cada conclusão só é produzida quando há dados suficientes;
//! caso contrário, o motivo é informado em `needs_more_data`.

use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;

use crate::error::AppResult;
use crate::fmt::{brl, month_name, pct};
use crate::models::{CategoryTotal, Kind, MonthPoint};
use crate::period::{iso, Month};
use crate::services::dashboard::{balance_at, category_totals, monthly_series, savings_rate, totals};

/// Meses mínimos com movimentação para calcular médias.
const MIN_MONTHS_FOR_AVERAGE: usize = 3;
/// Valor mínimo no mês anterior para considerar o crescimento de uma categoria (R$ 20).
const MIN_GROWTH_BASE_CENTS: i64 = 2_000;
/// Crescimento mínimo (%) para destacar uma categoria.
const MIN_GROWTH_PCT: f64 = 10.0;

#[derive(Debug, Clone, Copy, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum Tone {
    Positive,
    Negative,
    Neutral,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Insight {
    pub id: &'static str,
    pub tone: Tone,
    pub message: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExpenseRef {
    pub id: i64,
    pub description: String,
    pub amount_cents: i64,
    pub date: String,
    pub category_name: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CategoryGrowth {
    pub category_id: i64,
    pub name: String,
    pub color: String,
    pub previous_cents: i64,
    pub current_cents: i64,
    pub change_pct: f64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecurringCandidate {
    pub description: String,
    pub category_name: String,
    pub months: i64,
    pub average_cents: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IncomeShare {
    pub category_id: i64,
    pub name: String,
    pub color: String,
    pub total_cents: i64,
    /// Percentual da receita do mês consumido pela categoria.
    pub share_of_income: f64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Analytics {
    pub month: String,
    pub income_cents: i64,
    pub expense_cents: i64,
    pub has_month_data: bool,
    pub previous_expense_cents: Option<i64>,
    pub expense_change_cents: Option<i64>,
    pub expense_change_pct: Option<f64>,
    pub average_expense_cents: Option<i64>,
    pub months_with_data: usize,
    pub largest_expense: Option<ExpenseRef>,
    pub smallest_expense: Option<ExpenseRef>,
    pub income_committed_pct: Option<f64>,
    pub savings_rate: Option<f64>,
    pub top_category: Option<CategoryTotal>,
    pub fastest_growing: Option<CategoryGrowth>,
    pub income_consumers: Vec<IncomeShare>,
    pub recurring_candidates: Vec<RecurringCandidate>,
    pub registered_recurring_monthly_cents: i64,
    pub balance_start_cents: Option<i64>,
    pub balance_end_cents: Option<i64>,
    pub insights: Vec<Insight>,
    pub needs_more_data: Vec<String>,
}

fn month_has_data(conn: &Connection, m: Month) -> AppResult<bool> {
    let (s, e) = m.bounds();
    Ok(conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM transactions WHERE date >= ?1 AND date < ?2)",
        params![s, e],
        |r| r.get(0),
    )?)
}

fn expense_extreme(conn: &Connection, m: Month, largest: bool) -> AppResult<Option<ExpenseRef>> {
    let (s, e) = m.bounds();
    let order = if largest { "DESC" } else { "ASC" };
    Ok(conn
        .query_row(
            &format!(
                "SELECT t.id, t.description, t.amount_cents, t.date, c.name
                 FROM transactions t JOIN categories c ON c.id = t.category_id
                 WHERE t.kind = 'expense' AND t.date >= ?1 AND t.date < ?2
                 ORDER BY t.amount_cents {order}, t.date LIMIT 1"
            ),
            params![s, e],
            |r| {
                Ok(ExpenseRef {
                    id: r.get(0)?,
                    description: r.get(1)?,
                    amount_cents: r.get(2)?,
                    date: r.get(3)?,
                    category_name: r.get(4)?,
                })
            },
        )
        .optional()?)
}

/// Descrições de despesa que aparecem em pelo menos 3 dos últimos 6 meses (até `m`).
fn recurring_candidates(conn: &Connection, m: Month) -> AppResult<Vec<RecurringCandidate>> {
    let start = iso(m.add(-5).first_day());
    let end = iso(m.add(1).first_day());
    let mut stmt = conn.prepare_cached(
        "SELECT MIN(t.description), MIN(c.name),
                COUNT(DISTINCT substr(t.date, 1, 7)) AS months,
                SUM(t.amount_cents) / COUNT(DISTINCT substr(t.date, 1, 7))
         FROM transactions t JOIN categories c ON c.id = t.category_id
         WHERE t.kind = 'expense' AND t.date >= ?1 AND t.date < ?2
           AND t.recurring_id IS NULL AND t.installment_plan_id IS NULL
         GROUP BY lower(trim(t.description))
         HAVING months >= 3
         ORDER BY months DESC, 4 DESC
         LIMIT 8",
    )?;
    let rows = stmt
        .query_map(params![start, end], |r| {
            Ok(RecurringCandidate {
                description: r.get(0)?,
                category_name: r.get(1)?,
                months: r.get(2)?,
                average_cents: r.get(3)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

/// Equivalente mensal das contas recorrentes ativas no mês.
fn registered_recurring_monthly(conn: &Connection, m: Month) -> AppResult<i64> {
    let (s, e) = m.bounds();
    Ok(conn.query_row(
        "SELECT COALESCE(SUM(CASE frequency
                    WHEN 'weekly'  THEN amount_cents * 52 / 12
                    WHEN 'monthly' THEN amount_cents
                    WHEN 'yearly'  THEN amount_cents / 12 END), 0)
         FROM recurring_expenses
         WHERE active = 1 AND start_date < ?2 AND (end_date IS NULL OR end_date >= ?1)",
        params![s, e],
        |r| r.get(0),
    )?)
}

pub fn get(conn: &Connection, month: Month) -> AppResult<Analytics> {
    let (start, end) = month.bounds();
    let prev = month.add(-1);
    let (prev_start, prev_end) = prev.bounds();

    let (income, expense) = totals(conn, &start, &end)?;
    let has_month_data = month_has_data(conn, month)?;
    let prev_has_data = month_has_data(conn, prev)?;
    let (_, prev_expense) = totals(conn, &prev_start, &prev_end)?;

    let mut insights = Vec::new();
    let mut needs = Vec::new();
    let mname = month_name(month.month);

    // Médias: meses com movimentação nos últimos 12 meses (incluindo o atual).
    let series: Vec<MonthPoint> = monthly_series(conn, month.add(-11), month)?;
    let mut months_with_data = 0usize;
    let mut sum_exp = 0i64;
    for (i, p) in series.iter().enumerate() {
        if month_has_data(conn, month.add(i as i32 - 11))? {
            months_with_data += 1;
            sum_exp += p.expense_cents;
        }
    }
    let average_expense = (months_with_data >= MIN_MONTHS_FOR_AVERAGE).then(|| sum_exp / months_with_data as i64);

    let expense_cats = category_totals(conn, Kind::Expense, &start, &end)?;
    let prev_cats = category_totals(conn, Kind::Expense, &prev_start, &prev_end)?;

    if !has_month_data {
        needs.push(format!("Ainda não há movimentações em {mname}. Registre receitas e despesas para ver as análises do mês."));
    }

    // 1. Categoria com maior volume de despesas
    let top_category = expense_cats.first().cloned();
    if let Some(top) = &top_category {
        insights.push(Insight {
            id: "top_category",
            tone: Tone::Neutral,
            message: format!(
                "Seu maior gasto em {mname} foi com {}: {} ({} das despesas).",
                top.name.to_lowercase(),
                brl(top.total_cents),
                pct(top.share)
            ),
        });
        // Participação da segunda maior categoria, quando relevante
        if let Some(second) = expense_cats.get(1).filter(|c| c.share >= 10.0) {
            insights.push(Insight {
                id: "category_share",
                tone: Tone::Neutral,
                message: format!(
                    "{} representa {} das suas despesas do mês.",
                    second.name,
                    pct(second.share)
                ),
            });
        }
    }

    // 2. Categoria com maior crescimento
    let fastest_growing = if prev_has_data {
        expense_cats
            .iter()
            .filter_map(|cur| {
                let p = prev_cats.iter().find(|p| p.category_id == cur.category_id)?;
                if p.total_cents < MIN_GROWTH_BASE_CENTS || cur.total_cents <= p.total_cents {
                    return None;
                }
                let change = (cur.total_cents - p.total_cents) as f64 / p.total_cents as f64 * 100.0;
                (change >= MIN_GROWTH_PCT).then(|| CategoryGrowth {
                    category_id: cur.category_id,
                    name: cur.name.clone(),
                    color: cur.color.clone(),
                    previous_cents: p.total_cents,
                    current_cents: cur.total_cents,
                    change_pct: change,
                })
            })
            .max_by_key(|g| g.current_cents - g.previous_cents)
    } else {
        None
    };
    if let Some(g) = &fastest_growing {
        insights.push(Insight {
            id: "fastest_growing",
            tone: Tone::Negative,
            message: format!(
                "Você gastou {} a mais com {} em comparação ao mês anterior ({} → {}).",
                pct(g.change_pct),
                g.name.to_lowercase(),
                brl(g.previous_cents),
                brl(g.current_cents)
            ),
        });
    }

    // 4. Comparação com o mês anterior
    let (expense_change, expense_change_pct) = if prev_has_data && has_month_data {
        let diff = expense - prev_expense;
        let p = (prev_expense > 0).then(|| diff as f64 / prev_expense as f64 * 100.0);
        if diff < 0 {
            insights.push(Insight {
                id: "vs_previous",
                tone: Tone::Positive,
                message: format!("Você reduziu suas despesas em {} em comparação ao mês anterior.", brl(-diff)),
            });
        } else if diff > 0 {
            insights.push(Insight {
                id: "vs_previous",
                tone: Tone::Negative,
                message: match p {
                    Some(p) => format!("Suas despesas aumentaram {} ({}) em relação ao mês anterior.", brl(diff), pct(p)),
                    None => format!("Suas despesas aumentaram {} em relação ao mês anterior.", brl(diff)),
                },
            });
        } else {
            insights.push(Insight {
                id: "vs_previous",
                tone: Tone::Neutral,
                message: "Suas despesas ficaram iguais às do mês anterior.".into(),
            });
        }
        (Some(diff), p)
    } else {
        if has_month_data {
            needs.push("Registre movimentações do mês anterior para comparar a evolução entre os meses.".into());
        }
        (None, None)
    };

    // 5. Média mensal
    match average_expense {
        Some(avg) => {
            insights.push(Insight {
                id: "average",
                tone: Tone::Neutral,
                message: format!(
                    "Sua média mensal de despesas é {} (considerando {} meses com movimentações).",
                    brl(avg),
                    months_with_data
                ),
            });
            if has_month_data && avg > 0 {
                let vs = (expense - avg) as f64 / avg as f64 * 100.0;
                if vs >= 15.0 {
                    insights.push(Insight {
                        id: "above_average",
                        tone: Tone::Negative,
                        message: format!("As despesas de {mname} estão {} acima da sua média mensal.", pct(vs)),
                    });
                } else if vs <= -15.0 {
                    insights.push(Insight {
                        id: "below_average",
                        tone: Tone::Positive,
                        message: format!("As despesas de {mname} estão {} abaixo da sua média mensal.", pct(-vs)),
                    });
                }
            }
        }
        None => needs.push(format!(
            "São necessários pelo menos {MIN_MONTHS_FOR_AVERAGE} meses com movimentações para calcular médias (atualmente: {months_with_data})."
        )),
    }

    // 8 e 9. Comprometimento da receita e taxa de economia
    let rate = savings_rate(income, expense);
    let committed = (income > 0).then(|| expense as f64 / income as f64 * 100.0);
    if income > 0 {
        let result = income - expense;
        if result > 0 {
            insights.push(Insight {
                id: "savings",
                tone: Tone::Positive,
                message: format!(
                    "Você conseguiu guardar {} em {mname}, equivalente a {} da sua receita.",
                    brl(result),
                    pct(rate.unwrap_or(0.0))
                ),
            });
        } else if result < 0 {
            insights.push(Insight {
                id: "savings",
                tone: Tone::Negative,
                message: format!("Suas despesas superaram suas receitas em {} neste mês.", brl(-result)),
            });
        }
        if let Some(c) = committed.filter(|_| expense > 0) {
            insights.push(Insight {
                id: "committed",
                tone: if c > 100.0 { Tone::Negative } else if c >= 80.0 { Tone::Neutral } else { Tone::Positive },
                message: format!("{} da sua receita do mês foi comprometida com despesas.", pct(c)),
            });
        }
    } else if has_month_data {
        needs.push("Registre as receitas do mês para calcular a taxa de economia e o comprometimento da renda.".into());
    }

    // 12. Categorias que mais consomem a renda
    let income_consumers: Vec<IncomeShare> = if income > 0 {
        expense_cats
            .iter()
            .take(3)
            .map(|c| IncomeShare {
                category_id: c.category_id,
                name: c.name.clone(),
                color: c.color.clone(),
                total_cents: c.total_cents,
                share_of_income: c.total_cents as f64 / income as f64 * 100.0,
            })
            .collect()
    } else {
        Vec::new()
    };
    if income_consumers.len() >= 2 {
        let total: f64 = income_consumers.iter().map(|c| c.share_of_income).sum();
        let names: Vec<String> = income_consumers.iter().map(|c| c.name.to_lowercase()).collect();
        let joined = match names.as_slice() {
            [a, b] => format!("{a} e {b}"),
            [a, b, c] => format!("{a}, {b} e {c}"),
            _ => names.join(", "),
        };
        insights.push(Insight {
            id: "income_consumers",
            tone: Tone::Neutral,
            message: format!("Juntas, {joined} consomem {} da sua renda do mês.", pct(total)),
        });
    }

    // 11. Despesas recorrentes
    let candidates = recurring_candidates(conn, month)?;
    let registered = registered_recurring_monthly(conn, month)?;
    if registered > 0 && expense > 0 {
        insights.push(Insight {
            id: "registered_recurring",
            tone: Tone::Neutral,
            message: format!(
                "Suas contas recorrentes somam {} por mês, o equivalente a {} das despesas de {mname}.",
                brl(registered),
                pct(registered as f64 / expense as f64 * 100.0)
            ),
        });
    }
    if let Some(first) = candidates.first() {
        insights.push(Insight {
            id: "recurring_candidates",
            tone: Tone::Neutral,
            message: if candidates.len() == 1 {
                format!("\"{}\" se repete em {} dos últimos 6 meses. Considere cadastrá-la como conta recorrente.", first.description, first.months)
            } else {
                format!(
                    "Identificamos {} despesas que se repetem quase todo mês, como \"{}\".",
                    candidates.len(),
                    first.description
                )
            },
        });
    }

    // 10. Evolução do saldo no mês
    let balance_start = balance_at(conn, month.first_day().pred_opt().expect("data válida"))?;
    let balance_end = balance_at(conn, month.last_day())?;
    if let (Some(s), Some(e)) = (balance_start, balance_end) {
        if has_month_data && s != e {
            insights.push(Insight {
                id: "balance",
                tone: if e > s { Tone::Positive } else { Tone::Negative },
                message: format!("Seu saldo foi de {} para {} ao longo de {mname}.", brl(s), brl(e)),
            });
        }
    }

    Ok(Analytics {
        month: month.key(),
        income_cents: income,
        expense_cents: expense,
        has_month_data,
        previous_expense_cents: prev_has_data.then_some(prev_expense),
        expense_change_cents: expense_change,
        expense_change_pct,
        average_expense_cents: average_expense,
        months_with_data,
        largest_expense: expense_extreme(conn, month, true)?,
        smallest_expense: expense_extreme(conn, month, false)?,
        income_committed_pct: committed,
        savings_rate: rate,
        top_category,
        fastest_growing,
        income_consumers,
        recurring_candidates: candidates,
        registered_recurring_monthly_cents: registered,
        balance_start_cents: balance_start,
        balance_end_cents: balance_end,
        insights,
        needs_more_data: needs,
    })
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct History {
    pub months: Vec<MonthPoint>,
    pub months_with_data: usize,
    pub total_income_cents: i64,
    pub total_expense_cents: i64,
    pub average_income_cents: Option<i64>,
    pub average_expense_cents: Option<i64>,
    pub average_result_cents: Option<i64>,
    pub categories: Vec<CategoryTotal>,
}

/// Comparação histórica dos últimos `span` meses terminando em `month` (3, 6 ou 12).
pub fn history(conn: &Connection, month: Month, span: u32) -> AppResult<History> {
    let span = span.clamp(1, 24) as i32;
    let first = month.add(-(span - 1));
    let months = monthly_series(conn, first, month)?;
    let mut with_data = 0usize;
    for i in 0..span {
        if month_has_data(conn, first.add(i))? {
            with_data += 1;
        }
    }
    let ti: i64 = months.iter().map(|m| m.income_cents).sum();
    let te: i64 = months.iter().map(|m| m.expense_cents).sum();
    let avg = |v: i64| (with_data > 0).then(|| v / with_data as i64);
    Ok(History {
        months_with_data: with_data,
        total_income_cents: ti,
        total_expense_cents: te,
        average_income_cents: avg(ti),
        average_expense_cents: avg(te),
        average_result_cents: avg(ti - te),
        categories: category_totals(conn, Kind::Expense, &iso(first.first_day()), &iso(month.add(1).first_day()))?,
        months,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::Db;
    use crate::services::transactions::tests::add;

    fn ids(a: &Analytics) -> Vec<&str> {
        a.insights.iter().map(|i| i.id).collect()
    }

    #[test]
    fn empty_database_produces_no_conclusions() {
        let db = Db::open_in_memory().unwrap();
        db.with(|c| {
            let a = get(c, Month::parse("2026-03")?)?;
            assert!(a.insights.is_empty());
            assert!(!a.needs_more_data.is_empty());
            assert_eq!(a.average_expense_cents, None);
            assert_eq!(a.savings_rate, None);
            Ok(())
        })
        .unwrap();
    }

    #[test]
    fn compares_with_previous_month_and_detects_growth() {
        let db = Db::open_in_memory().unwrap();
        db.with(|c| {
            add(c, "Salário", 300_000, Kind::Income, "Salário", "2026-02-01");
            add(c, "Mercado", 50_000, Kind::Expense, "Alimentação", "2026-02-10");
            add(c, "Salário", 300_000, Kind::Income, "Salário", "2026-03-01");
            add(c, "Mercado", 61_500, Kind::Expense, "Alimentação", "2026-03-10");
            add(c, "Notebook", 200_000, Kind::Expense, "Tecnologia", "2026-03-12");

            let a = get(c, Month::parse("2026-03")?)?;
            assert_eq!(a.expense_change_cents, Some(211_500));
            let g = a.fastest_growing.as_ref().unwrap();
            assert_eq!(g.name, "Alimentação");
            assert!((g.change_pct - 23.0).abs() < 1e-9);
            assert!(a.insights.iter().any(|i| i.message.contains("23% a mais com alimentação")));
            assert_eq!(a.top_category.as_ref().unwrap().name, "Tecnologia");
            assert_eq!(a.largest_expense.as_ref().unwrap().amount_cents, 200_000);
            assert_eq!(a.smallest_expense.as_ref().unwrap().amount_cents, 61_500);
            // Apenas 2 meses: sem média
            assert_eq!(a.average_expense_cents, None);
            assert!(!ids(&a).contains(&"average"));
            Ok(())
        })
        .unwrap();
    }

    #[test]
    fn savings_message_matches_spec_example() {
        let db = Db::open_in_memory().unwrap();
        db.with(|c| {
            add(c, "Salário", 300_000, Kind::Income, "Salário", "2026-03-01");
            add(c, "Gastos", 240_000, Kind::Expense, "Outros", "2026-03-15");
            let a = get(c, Month::parse("2026-03")?)?;
            assert_eq!(a.savings_rate, Some(20.0));
            assert!(a.insights.iter().any(|i| i.message.contains("R$ 600,00") && i.message.contains("20%")));
            Ok(())
        })
        .unwrap();
    }

    #[test]
    fn average_requires_three_months_and_handles_year_boundary() {
        let db = Db::open_in_memory().unwrap();
        db.with(|c| {
            add(c, "Netflix", 4_000, Kind::Expense, "Assinaturas", "2025-11-05");
            add(c, "Netflix", 4_000, Kind::Expense, "Assinaturas", "2025-12-05");
            add(c, "Netflix", 4_000, Kind::Expense, "Assinaturas", "2026-01-05");
            let a = get(c, Month::parse("2026-01")?)?;
            assert_eq!(a.months_with_data, 3);
            assert_eq!(a.average_expense_cents, Some(4_000));
            assert_eq!(a.recurring_candidates.len(), 1);
            assert_eq!(a.recurring_candidates[0].months, 3);
            assert_eq!(a.expense_change_cents, Some(0));
            Ok(())
        })
        .unwrap();
    }

    #[test]
    fn history_spans() {
        let db = Db::open_in_memory().unwrap();
        db.with(|c| {
            add(c, "A", 1_000, Kind::Expense, "Lazer", "2026-01-10");
            add(c, "B", 3_000, Kind::Expense, "Lazer", "2026-03-10");
            add(c, "S", 10_000, Kind::Income, "Salário", "2026-03-01");
            let h = history(c, Month::parse("2026-03")?, 3)?;
            assert_eq!(h.months.len(), 3);
            assert_eq!(h.months_with_data, 2);
            assert_eq!(h.total_expense_cents, 4_000);
            assert_eq!(h.average_expense_cents, Some(2_000));
            let h12 = history(c, Month::parse("2026-03")?, 12)?;
            assert_eq!(h12.months.len(), 12);
            assert_eq!(h12.months[0].month, "2025-04");
            Ok(())
        })
        .unwrap();
    }
}
