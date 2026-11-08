//! Indicadores do dashboard: saldo, totais do período, gráficos e últimas movimentações.

use chrono::NaiveDate;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};

use crate::error::AppResult;
use crate::models::{BalancePoint, CategoryTotal, Kind, MonthPoint, Transaction};
use crate::period::{iso, parse_date, Month};
use crate::services::{settings, transactions};

#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum PeriodInput {
    Month { year: i32, month: u32 },
    Year { year: i32 },
}

/// Período resolvido em meses (primeiro e último, inclusivos).
#[derive(Debug, Clone, Copy)]
pub struct Period {
    pub first: Month,
    pub last: Month,
}

impl Period {
    pub fn resolve(p: PeriodInput) -> AppResult<Self> {
        Ok(match p {
            PeriodInput::Month { year, month } => {
                let m = Month::new(year, month)?;
                Self { first: m, last: m }
            }
            PeriodInput::Year { year } => Self { first: Month::new(year, 1)?, last: Month::new(year, 12)? },
        })
    }
    pub fn start(&self) -> String {
        iso(self.first.first_day())
    }
    pub fn end_exclusive(&self) -> String {
        iso(self.last.add(1).first_day())
    }
    pub fn last_day(&self) -> NaiveDate {
        self.last.last_day()
    }
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum BalanceMode {
    /// O período contém hoje: saldo disponível até hoje.
    Current,
    /// Período encerrado: saldo no fim do período.
    Past,
    /// Período futuro: saldo projetado com os lançamentos já planejados.
    Projected,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Dashboard {
    pub today: String,
    pub current_balance_cents: i64,
    pub period_balance_cents: Option<i64>,
    pub balance_mode: BalanceMode,
    pub income_cents: i64,
    pub expense_cents: i64,
    pub result_cents: i64,
    /// Percentual da receita que não foi consumido. `None` sem receita no período.
    pub savings_rate: Option<f64>,
    pub expense_by_category: Vec<CategoryTotal>,
    pub monthly: Vec<MonthPoint>,
    pub balance_evolution: Vec<BalancePoint>,
    pub recent: Vec<Transaction>,
    pub has_transactions: bool,
}

/// Saldo em uma data (inclusiva): saldo inicial + receitas − despesas desde a data de referência.
/// `None` se a data é anterior à referência do saldo inicial.
pub fn balance_at(conn: &Connection, date: NaiveDate) -> AppResult<Option<i64>> {
    let s = settings::load(conn)?;
    let reference = match &s.initial_balance_date {
        Some(r) => {
            let r = parse_date(r)?;
            if date < r {
                return Ok(None);
            }
            iso(r)
        }
        None => String::from("0000-00-00"),
    };
    let net: i64 = conn.query_row(
        "SELECT COALESCE(SUM(CASE WHEN kind = 'income' THEN amount_cents ELSE -amount_cents END), 0)
         FROM transactions WHERE date >= ?1 AND date <= ?2",
        params![reference, iso(date)],
        |r| r.get(0),
    )?;
    Ok(Some(s.initial_balance_cents + net))
}

pub fn totals(conn: &Connection, start: &str, end_excl: &str) -> AppResult<(i64, i64)> {
    Ok(conn.query_row(
        "SELECT COALESCE(SUM(CASE WHEN kind = 'income' THEN amount_cents END), 0),
                COALESCE(SUM(CASE WHEN kind = 'expense' THEN amount_cents END), 0)
         FROM transactions WHERE date >= ?1 AND date < ?2",
        params![start, end_excl],
        |r| Ok((r.get(0)?, r.get(1)?)),
    )?)
}

pub fn savings_rate(income: i64, expense: i64) -> Option<f64> {
    (income > 0).then(|| (income - expense) as f64 / income as f64 * 100.0)
}

pub fn category_totals(conn: &Connection, kind: Kind, start: &str, end_excl: &str) -> AppResult<Vec<CategoryTotal>> {
    let mut stmt = conn.prepare_cached(
        "SELECT c.id, c.name, c.color, c.icon, SUM(t.amount_cents) AS total
         FROM transactions t JOIN categories c ON c.id = t.category_id
         WHERE t.kind = ?1 AND t.date >= ?2 AND t.date < ?3
         GROUP BY c.id ORDER BY total DESC",
    )?;
    let mut rows = stmt
        .query_map(params![kind, start, end_excl], |r| {
            Ok(CategoryTotal {
                category_id: r.get(0)?,
                name: r.get(1)?,
                color: r.get(2)?,
                icon: r.get(3)?,
                total_cents: r.get(4)?,
                share: 0.0,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    let sum: i64 = rows.iter().map(|r| r.total_cents).sum();
    if sum > 0 {
        for r in &mut rows {
            r.share = r.total_cents as f64 / sum as f64 * 100.0;
        }
    }
    Ok(rows)
}

/// Receitas e despesas mês a mês, incluindo meses sem movimentação (zerados).
pub fn monthly_series(conn: &Connection, first: Month, last: Month) -> AppResult<Vec<MonthPoint>> {
    let mut stmt = conn.prepare_cached(
        "SELECT substr(date, 1, 7) AS ym,
                COALESCE(SUM(CASE WHEN kind = 'income' THEN amount_cents END), 0),
                COALESCE(SUM(CASE WHEN kind = 'expense' THEN amount_cents END), 0)
         FROM transactions WHERE date >= ?1 AND date < ?2
         GROUP BY ym",
    )?;
    let found: std::collections::HashMap<String, (i64, i64)> = stmt
        .query_map(params![iso(first.first_day()), iso(last.add(1).first_day())], |r| {
            Ok((r.get::<_, String>(0)?, (r.get(1)?, r.get(2)?)))
        })?
        .collect::<Result<_, _>>()?;
    let n = last.diff(first);
    Ok((0..=n)
        .map(|i| {
            let m = first.add(i).key();
            let (inc, exp) = found.get(&m).copied().unwrap_or((0, 0));
            MonthPoint { month: m, income_cents: inc, expense_cents: exp, result_cents: inc - exp }
        })
        .collect())
}

/// Saldo ao fim de cada mês entre `first` e `last`.
pub fn balance_series(conn: &Connection, first: Month, last: Month) -> AppResult<Vec<BalancePoint>> {
    let s = settings::load(conn)?;
    let reference = s.initial_balance_date.as_deref().map(parse_date).transpose()?;
    let ref_iso = reference.map(iso).unwrap_or_else(|| "0000-00-00".into());

    // Saldo no início da série
    let mut running: i64 = s.initial_balance_cents
        + conn.query_row(
            "SELECT COALESCE(SUM(CASE WHEN kind = 'income' THEN amount_cents ELSE -amount_cents END), 0)
             FROM transactions WHERE date >= ?1 AND date < ?2",
            params![ref_iso, iso(first.first_day())],
            |r| r.get::<_, i64>(0),
        )?;

    let mut stmt = conn.prepare_cached(
        "SELECT substr(date, 1, 7) AS ym,
                SUM(CASE WHEN kind = 'income' THEN amount_cents ELSE -amount_cents END)
         FROM transactions WHERE date >= max(?1, ?2) AND date < ?3
         GROUP BY ym",
    )?;
    let nets: std::collections::HashMap<String, i64> = stmt
        .query_map(params![ref_iso, iso(first.first_day()), iso(last.add(1).first_day())], |r| {
            Ok((r.get::<_, String>(0)?, r.get(1)?))
        })?
        .collect::<Result<_, _>>()?;

    Ok((0..=last.diff(first))
        .map(|i| {
            let m = first.add(i);
            running += nets.get(&m.key()).copied().unwrap_or(0);
            let defined = reference.is_none_or(|r| m.last_day() >= r);
            BalancePoint { month: m.key(), balance_cents: defined.then_some(running) }
        })
        .collect())
}

pub fn get(conn: &Connection, input: PeriodInput, today: NaiveDate) -> AppResult<Dashboard> {
    let p = Period::resolve(input)?;
    let (start, end) = (p.start(), p.end_exclusive());
    let (income, expense) = totals(conn, &start, &end)?;

    let current_balance = balance_at(conn, today)?.unwrap_or(0);
    let today_iso = iso(today);
    let (mode, period_balance) = if today_iso >= start && today_iso < end {
        (BalanceMode::Current, Some(current_balance))
    } else if today_iso >= end {
        (BalanceMode::Past, balance_at(conn, p.last_day())?)
    } else {
        (BalanceMode::Projected, balance_at(conn, p.last_day())?)
    };

    // Barras: últimos 6 meses (visão mensal) ou os 12 meses do ano (visão anual).
    let bars_first = if p.first == p.last { p.last.add(-5) } else { p.first };
    // Linha: 12 meses terminando no fim do período.
    let line_first = p.last.add(-11);

    let mut stmt = conn.prepare_cached(&format!(
        "{} WHERE t.date >= ?1 AND t.date < ?2 ORDER BY t.date DESC, t.id DESC LIMIT 8",
        transactions::SELECT
    ))?;
    let recent = stmt.query_map(params![start, end], transactions::map)?.collect::<Result<Vec<_>, _>>()?;

    let has_transactions: bool =
        conn.query_row("SELECT EXISTS(SELECT 1 FROM transactions)", [], |r| r.get(0))?;

    Ok(Dashboard {
        today: today_iso,
        current_balance_cents: current_balance,
        period_balance_cents: period_balance,
        balance_mode: mode,
        income_cents: income,
        expense_cents: expense,
        result_cents: income - expense,
        savings_rate: savings_rate(income, expense),
        expense_by_category: category_totals(conn, Kind::Expense, &start, &end)?,
        monthly: monthly_series(conn, bars_first, p.last)?,
        balance_evolution: balance_series(conn, line_first, p.last)?,
        recent,
        has_transactions,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::Db;
    use crate::services::settings::{save, Settings};
    use crate::services::transactions::tests::add;

    fn d(s: &str) -> NaiveDate {
        parse_date(s).unwrap()
    }

    #[test]
    fn balance_respects_reference_date_and_ignores_older_transactions() {
        let db = Db::open_in_memory().unwrap();
        db.with(|c| {
            add(c, "Antes da referência", 99_999, Kind::Income, "Salário", "2025-12-31");
            save(c, Settings { initial_balance_cents: 100_000, initial_balance_date: Some("2026-01-01".into()), hide_values: false, theme: "light".into() })?;
            add(c, "Salário", 300_000, Kind::Income, "Salário", "2026-01-05");
            add(c, "Aluguel", 120_000, Kind::Expense, "Moradia", "2026-01-10");
            add(c, "Futuro", 50_000, Kind::Expense, "Lazer", "2026-02-10");

            assert_eq!(balance_at(c, d("2025-12-31"))?, None);
            assert_eq!(balance_at(c, d("2026-01-01"))?, Some(100_000));
            assert_eq!(balance_at(c, d("2026-01-31"))?, Some(280_000));
            assert_eq!(balance_at(c, d("2026-02-28"))?, Some(230_000));
            Ok(())
        })
        .unwrap();
    }

    #[test]
    fn dashboard_month_totals_and_savings_rate() {
        let db = Db::open_in_memory().unwrap();
        db.with(|c| {
            add(c, "Salário", 300_000, Kind::Income, "Salário", "2026-03-01");
            add(c, "Mercado", 150_000, Kind::Expense, "Alimentação", "2026-03-15");
            add(c, "Uber", 90_000, Kind::Expense, "Transporte", "2026-03-31");
            add(c, "Abril", 10_000, Kind::Expense, "Lazer", "2026-04-01"); // fora do mês

            let dash = get(c, PeriodInput::Month { year: 2026, month: 3 }, d("2026-03-20"))?;
            assert_eq!(dash.income_cents, 300_000);
            assert_eq!(dash.expense_cents, 240_000);
            assert_eq!(dash.result_cents, 60_000);
            assert_eq!(dash.savings_rate, Some(20.0));
            assert_eq!(dash.balance_mode, BalanceMode::Current);
            // saldo atual até 20/03: 300.000 − 150.000
            assert_eq!(dash.current_balance_cents, 150_000);
            assert_eq!(dash.expense_by_category[0].name, "Alimentação");
            assert!((dash.expense_by_category[0].share - 62.5).abs() < 1e-9);
            assert_eq!(dash.monthly.len(), 6);
            assert_eq!(dash.monthly[0].month, "2025-10");
            assert_eq!(dash.balance_evolution.len(), 12);
            assert_eq!(dash.recent.len(), 3);
            Ok(())
        })
        .unwrap();
    }

    #[test]
    fn savings_rate_without_income_is_none() {
        assert_eq!(savings_rate(0, 1000), None);
        assert_eq!(savings_rate(1000, 1500), Some(-50.0));
    }

    #[test]
    fn year_view_and_year_boundary() {
        let db = Db::open_in_memory().unwrap();
        db.with(|c| {
            add(c, "Dez", 10_000, Kind::Expense, "Lazer", "2025-12-31");
            add(c, "Jan", 20_000, Kind::Expense, "Lazer", "2026-01-01");
            let y = get(c, PeriodInput::Year { year: 2026 }, d("2026-06-01"))?;
            assert_eq!(y.expense_cents, 20_000);
            assert_eq!(y.monthly.len(), 12);
            assert_eq!(y.monthly[0].month, "2026-01");
            let dec = get(c, PeriodInput::Month { year: 2025, month: 12 }, d("2026-06-01"))?;
            assert_eq!(dec.expense_cents, 10_000);
            assert_eq!(dec.balance_mode, BalanceMode::Past);
            Ok(())
        })
        .unwrap();
    }

    #[test]
    fn balance_series_accumulates() {
        let db = Db::open_in_memory().unwrap();
        db.with(|c| {
            save(c, Settings { initial_balance_cents: 1_000, initial_balance_date: Some("2026-02-15".into()), hide_values: false, theme: "light".into() })?;
            add(c, "Ignorada", 5_000, Kind::Income, "Salário", "2026-02-01");
            add(c, "Fev", 2_000, Kind::Income, "Salário", "2026-02-20");
            add(c, "Mar", 500, Kind::Expense, "Lazer", "2026-03-10");
            let s = balance_series(c, Month::parse("2026-01")?, Month::parse("2026-03")?)?;
            assert_eq!(s[0].balance_cents, None);
            assert_eq!(s[1].balance_cents, Some(3_000));
            assert_eq!(s[2].balance_cents, Some(2_500));
            Ok(())
        })
        .unwrap();
    }
}
