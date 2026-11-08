//! Orçamentos mensais por categoria de despesa. Orçamentos são apenas metas:
//! nunca alteram os valores efetivamente gastos.

use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};

use crate::error::AppResult;
use crate::models::Kind;
use crate::period::Month;
use crate::services::categories::ensure_kind;
use crate::services::transactions::validate_amount;

/// A partir deste percentual o orçamento é considerado "próximo do limite".
pub const WARNING_PCT: f64 = 80.0;

#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum BudgetStatus {
    Ok,
    Warning,
    Over,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BudgetLine {
    pub category_id: i64,
    pub name: String,
    pub color: String,
    pub icon: String,
    pub limit_cents: i64,
    pub spent_cents: i64,
    pub remaining_cents: i64,
    pub used_pct: f64,
    pub status: BudgetStatus,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BudgetOverview {
    pub month: String,
    pub lines: Vec<BudgetLine>,
    pub total_limit_cents: i64,
    pub total_spent_cents: i64,
    /// Gasto em categorias sem orçamento definido no mês.
    pub unbudgeted_spent_cents: i64,
    pub previous_month_has_budgets: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BudgetInput {
    pub category_id: i64,
    pub month: String,
    pub limit_cents: i64,
}

pub fn status_for(limit: i64, spent: i64) -> (f64, BudgetStatus) {
    let pct = spent as f64 / limit as f64 * 100.0;
    let status = if spent > limit {
        BudgetStatus::Over
    } else if pct >= WARNING_PCT {
        BudgetStatus::Warning
    } else {
        BudgetStatus::Ok
    };
    (pct, status)
}

pub fn overview(conn: &Connection, month: Month) -> AppResult<BudgetOverview> {
    let (start, end) = month.bounds();
    let mut stmt = conn.prepare_cached(
        "SELECT c.id, c.name, c.color, c.icon, b.limit_cents,
                COALESCE((SELECT SUM(t.amount_cents) FROM transactions t
                          WHERE t.category_id = c.id AND t.kind = 'expense' AND t.date >= ?2 AND t.date < ?3), 0)
         FROM budgets b JOIN categories c ON c.id = b.category_id
         WHERE b.month = ?1
         ORDER BY c.name COLLATE NOCASE",
    )?;
    let lines = stmt
        .query_map(params![month.key(), start, end], |r| {
            let limit: i64 = r.get(4)?;
            let spent: i64 = r.get(5)?;
            let (used_pct, status) = status_for(limit, spent);
            Ok(BudgetLine {
                category_id: r.get(0)?,
                name: r.get(1)?,
                color: r.get(2)?,
                icon: r.get(3)?,
                limit_cents: limit,
                spent_cents: spent,
                remaining_cents: limit - spent,
                used_pct,
                status,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    let total_expense: i64 = conn.query_row(
        "SELECT COALESCE(SUM(amount_cents), 0) FROM transactions WHERE kind = 'expense' AND date >= ?1 AND date < ?2",
        params![start, end],
        |r| r.get(0),
    )?;
    let total_spent: i64 = lines.iter().map(|l| l.spent_cents).sum();
    let previous_month_has_budgets: bool = conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM budgets WHERE month = ?1)",
        [month.add(-1).key()],
        |r| r.get(0),
    )?;

    Ok(BudgetOverview {
        month: month.key(),
        total_limit_cents: lines.iter().map(|l| l.limit_cents).sum(),
        total_spent_cents: total_spent,
        unbudgeted_spent_cents: total_expense - total_spent,
        previous_month_has_budgets,
        lines,
    })
}

pub fn set(conn: &Connection, input: BudgetInput) -> AppResult<()> {
    let month = Month::parse(&input.month)?;
    validate_amount(input.limit_cents)?;
    ensure_kind(conn, input.category_id, Kind::Expense)?;
    conn.execute(
        "INSERT INTO budgets (category_id, month, limit_cents) VALUES (?1, ?2, ?3)
         ON CONFLICT(category_id, month) DO UPDATE SET limit_cents = excluded.limit_cents",
        params![input.category_id, month.key(), input.limit_cents],
    )?;
    Ok(())
}

pub fn remove(conn: &Connection, category_id: i64, month: &str) -> AppResult<()> {
    let month = Month::parse(month)?;
    conn.execute("DELETE FROM budgets WHERE category_id = ?1 AND month = ?2", params![category_id, month.key()])?;
    Ok(())
}

/// Copia os orçamentos do mês anterior para categorias que ainda não têm orçamento no mês.
/// Retorna quantos orçamentos foram copiados.
pub fn copy_previous(conn: &Connection, month: &str) -> AppResult<usize> {
    let month = Month::parse(month)?;
    Ok(conn.execute(
        "INSERT INTO budgets (category_id, month, limit_cents)
         SELECT category_id, ?1, limit_cents FROM budgets WHERE month = ?2
         ON CONFLICT(category_id, month) DO NOTHING",
        params![month.key(), month.add(-1).key()],
    )?)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::Db;
    use crate::services::dashboard::totals;
    use crate::services::transactions::tests::{add, cat};

    #[test]
    fn statuses() {
        assert_eq!(status_for(10_000, 5_000).1, BudgetStatus::Ok);
        assert_eq!(status_for(10_000, 8_000).1, BudgetStatus::Warning);
        assert_eq!(status_for(10_000, 10_000).1, BudgetStatus::Warning);
        assert_eq!(status_for(10_000, 10_001).1, BudgetStatus::Over);
    }

    #[test]
    fn budgets_are_independent_per_month_and_do_not_change_spending() {
        let db = Db::open_in_memory().unwrap();
        db.with(|c| {
            let food = cat(c, "Alimentação", Kind::Expense);
            add(c, "Mercado", 70_000, Kind::Expense, "Alimentação", "2026-03-10");
            add(c, "Uber", 5_000, Kind::Expense, "Transporte", "2026-03-11");
            set(c, BudgetInput { category_id: food, month: "2026-03".into(), limit_cents: 80_000 })?;

            let o = overview(c, Month::parse("2026-03")?)?;
            assert_eq!(o.lines.len(), 1);
            assert_eq!(o.lines[0].remaining_cents, 10_000);
            assert_eq!(o.lines[0].status, BudgetStatus::Warning);
            assert_eq!(o.unbudgeted_spent_cents, 5_000);
            assert_eq!(totals(c, "2026-03-01", "2026-04-01")?.1, 75_000);

            assert_eq!(copy_previous(c, "2026-04")?, 1);
            assert_eq!(copy_previous(c, "2026-04")?, 0, "não duplica");
            set(c, BudgetInput { category_id: food, month: "2026-04".into(), limit_cents: 50_000 })?;
            let mar = overview(c, Month::parse("2026-03")?)?;
            assert_eq!(mar.lines[0].limit_cents, 80_000, "alterar abril não muda março");

            remove(c, food, "2026-04")?;
            assert!(overview(c, Month::parse("2026-04")?)?.lines.is_empty());

            let income = cat(c, "Salário", Kind::Income);
            assert!(set(c, BudgetInput { category_id: income, month: "2026-03".into(), limit_cents: 1 }).is_err());
            Ok(())
        })
        .unwrap();
    }
}
