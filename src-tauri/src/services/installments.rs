//! Compras parceladas. Cada parcela é uma transação de despesa no mês do seu vencimento.
//! A soma das parcelas é sempre igual ao valor total: a diferença de arredondamento vai para a 1ª.

use chrono::NaiveDate;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};

use crate::error::{validation, AppError, AppResult};
use crate::models::{Kind, Transaction};
use crate::period::{add_months, iso, parse_date};
use crate::services::categories::ensure_kind;
use crate::services::transactions::{self, clean_text, validate_amount};

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallmentInput {
    pub description: String,
    pub total_cents: i64,
    pub installment_count: i64,
    pub first_date: String,
    pub category_id: i64,
    pub notes: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NextInstallment {
    pub number: i64,
    pub date: String,
    pub amount_cents: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallmentPlan {
    pub id: i64,
    pub description: String,
    pub total_cents: i64,
    pub installment_count: i64,
    /// Valor das parcelas 2..n (a 1ª pode ter alguns centavos a mais).
    pub installment_cents: i64,
    pub first_installment_cents: i64,
    pub first_date: String,
    pub last_date: String,
    pub category_id: i64,
    pub category_name: String,
    pub category_color: String,
    pub category_icon: String,
    pub notes: Option<String>,
    pub paid_count: i64,
    pub paid_cents: i64,
    pub remaining_cents: i64,
    pub next: Option<NextInstallment>,
}

/// Divide o total em `n` parcelas inteiras cuja soma é exatamente o total.
pub fn split(total_cents: i64, n: i64) -> Vec<i64> {
    let base = total_cents / n;
    let remainder = total_cents - base * n;
    (0..n).map(|i| if i == 0 { base + remainder } else { base }).collect()
}

pub fn installment_date(first: NaiveDate, index: i64) -> NaiveDate {
    add_months(first, index as u32)
}

fn validate(conn: &Connection, input: &InstallmentInput) -> AppResult<(String, Option<String>, NaiveDate)> {
    let (description, notes) = clean_text(&input.description, input.notes.as_deref())?;
    validate_amount(input.total_cents)?;
    if !(2..=420).contains(&input.installment_count) {
        return validation("A quantidade de parcelas deve estar entre 2 e 420.");
    }
    if input.total_cents < input.installment_count {
        return validation("O valor total é baixo demais para essa quantidade de parcelas.");
    }
    ensure_kind(conn, input.category_id, Kind::Expense)?;
    Ok((description, notes, parse_date(&input.first_date)?))
}

fn generate(conn: &Connection, plan_id: i64, input: &InstallmentInput, description: &str, first: NaiveDate) -> AppResult<()> {
    let mut stmt = conn.prepare_cached(
        "INSERT INTO transactions (description, amount_cents, kind, category_id, date, notes,
                                   installment_plan_id, installment_number)
         VALUES (?1, ?2, 'expense', ?3, ?4, NULL, ?5, ?6)",
    )?;
    for (i, amount) in split(input.total_cents, input.installment_count).into_iter().enumerate() {
        let date = iso(installment_date(first, i as i64));
        stmt.execute(params![description, amount, input.category_id, date, plan_id, i as i64 + 1])?;
    }
    Ok(())
}

pub fn create(conn: &mut Connection, input: InstallmentInput, today: NaiveDate) -> AppResult<InstallmentPlan> {
    let (description, notes, first) = validate(conn, &input)?;
    let tx = conn.transaction()?;
    tx.execute(
        "INSERT INTO installment_plans (description, total_cents, installment_count, first_date, category_id, notes)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![description, input.total_cents, input.installment_count, iso(first), input.category_id, notes],
    )?;
    let id = tx.last_insert_rowid();
    generate(&tx, id, &input, &description, first)?;
    tx.commit()?;
    get(conn, id, today)
}

/// Atualiza o parcelamento e regenera as parcelas (em uma única transação SQL).
pub fn update(conn: &mut Connection, id: i64, input: InstallmentInput, today: NaiveDate) -> AppResult<InstallmentPlan> {
    get(conn, id, today)?;
    let (description, notes, first) = validate(conn, &input)?;
    let tx = conn.transaction()?;
    tx.execute(
        "UPDATE installment_plans
         SET description = ?1, total_cents = ?2, installment_count = ?3, first_date = ?4, category_id = ?5,
             notes = ?6, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
         WHERE id = ?7",
        params![description, input.total_cents, input.installment_count, iso(first), input.category_id, notes, id],
    )?;
    tx.execute("DELETE FROM transactions WHERE installment_plan_id = ?1", [id])?;
    generate(&tx, id, &input, &description, first)?;
    tx.commit()?;
    get(conn, id, today)
}

/// Exclui o parcelamento e todas as suas parcelas.
pub fn delete(conn: &mut Connection, id: i64) -> AppResult<()> {
    let tx = conn.transaction()?;
    tx.execute("DELETE FROM transactions WHERE installment_plan_id = ?1", [id])?;
    let n = tx.execute("DELETE FROM installment_plans WHERE id = ?1", [id])?;
    if n == 0 {
        return Err(AppError::NotFound("Parcelamento não encontrado.".into()));
    }
    tx.commit()?;
    Ok(())
}

const SELECT: &str = "
    SELECT p.id, p.description, p.total_cents, p.installment_count, p.first_date, p.category_id,
           c.name, c.color, c.icon, p.notes,
           (SELECT COUNT(*) FROM transactions t WHERE t.installment_plan_id = p.id AND t.date <= ?1),
           (SELECT COALESCE(SUM(amount_cents), 0) FROM transactions t WHERE t.installment_plan_id = p.id AND t.date <= ?1),
           (SELECT MAX(date) FROM transactions t WHERE t.installment_plan_id = p.id)
    FROM installment_plans p JOIN categories c ON c.id = p.category_id";

fn map(r: &rusqlite::Row) -> rusqlite::Result<InstallmentPlan> {
    let total: i64 = r.get(2)?;
    let count: i64 = r.get(3)?;
    let parts = split(total, count);
    let paid_cents: i64 = r.get(11)?;
    Ok(InstallmentPlan {
        id: r.get(0)?,
        description: r.get(1)?,
        total_cents: total,
        installment_count: count,
        installment_cents: parts[1],
        first_installment_cents: parts[0],
        first_date: r.get(4)?,
        category_id: r.get(5)?,
        category_name: r.get(6)?,
        category_color: r.get(7)?,
        category_icon: r.get(8)?,
        notes: r.get(9)?,
        paid_count: r.get(10)?,
        paid_cents,
        remaining_cents: total - paid_cents,
        last_date: r.get::<_, Option<String>>(12)?.unwrap_or_default(),
        next: None,
    })
}

fn attach_next(conn: &Connection, mut plan: InstallmentPlan, today: &str) -> AppResult<InstallmentPlan> {
    plan.next = conn
        .query_row(
            "SELECT installment_number, date, amount_cents FROM transactions
             WHERE installment_plan_id = ?1 AND date > ?2 ORDER BY date LIMIT 1",
            params![plan.id, today],
            |r| Ok(NextInstallment { number: r.get(0)?, date: r.get(1)?, amount_cents: r.get(2)? }),
        )
        .optional()?;
    Ok(plan)
}

pub fn get(conn: &Connection, id: i64, today: NaiveDate) -> AppResult<InstallmentPlan> {
    let t = iso(today);
    let plan = conn
        .query_row(&format!("{SELECT} WHERE p.id = ?2"), params![t, id], map)
        .optional()?
        .ok_or_else(|| AppError::NotFound("Parcelamento não encontrado.".into()))?;
    attach_next(conn, plan, &t)
}

pub fn list(conn: &Connection, today: NaiveDate) -> AppResult<Vec<InstallmentPlan>> {
    let t = iso(today);
    let mut stmt = conn.prepare_cached(&format!("{SELECT} ORDER BY p.first_date DESC, p.id DESC"))?;
    let plans = stmt.query_map([&t], map)?.collect::<Result<Vec<_>, _>>()?;
    plans.into_iter().map(|p| attach_next(conn, p, &t)).collect()
}

pub fn parcels(conn: &Connection, id: i64) -> AppResult<Vec<Transaction>> {
    let mut stmt = conn.prepare_cached(&format!(
        "{} WHERE t.installment_plan_id = ?1 ORDER BY t.installment_number",
        transactions::SELECT
    ))?;
    let rows = stmt.query_map([id], transactions::map)?.collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::Db;
    use crate::services::dashboard::totals;
    use crate::services::transactions::tests::cat;

    fn input(c: &Connection, total: i64, n: i64, first: &str) -> InstallmentInput {
        InstallmentInput {
            description: "Notebook".into(),
            total_cents: total,
            installment_count: n,
            first_date: first.into(),
            category_id: cat(c, "Tecnologia", Kind::Expense),
            notes: None,
        }
    }

    #[test]
    fn split_preserves_total() {
        assert_eq!(split(120_000, 6), vec![20_000; 6]);
        assert_eq!(split(10_000, 3), vec![3_334, 3_333, 3_333]);
        for (t, n) in [(1_001, 7), (99_999, 12), (5, 5)] {
            assert_eq!(split(t, n).iter().sum::<i64>(), t);
        }
    }

    #[test]
    fn each_installment_lands_in_its_month() {
        let db = Db::open_in_memory().unwrap();
        db.with(|c| {
            let today = parse_date("2026-12-20")?;
            let p = create(c, input(c, 120_000, 6, "2026-11-10"), today)?;
            assert_eq!(p.installment_cents, 20_000);
            assert_eq!(p.paid_count, 2); // nov e dez
            assert_eq!(p.remaining_cents, 80_000);
            assert_eq!(p.last_date, "2027-04-10");
            let next = p.next.as_ref().unwrap();
            assert_eq!((next.number, next.date.as_str()), (3, "2027-01-10"));

            // Cada mês recebe só a sua parcela, inclusive após a virada do ano
            assert_eq!(totals(c, "2026-11-01", "2026-12-01")?.1, 20_000);
            assert_eq!(totals(c, "2027-01-01", "2027-02-01")?.1, 20_000);
            assert_eq!(totals(c, "2026-01-01", "2028-01-01")?.1, 120_000);
            Ok(())
        })
        .unwrap();
    }

    #[test]
    fn update_regenerates_and_delete_cascades() {
        let db = Db::open_in_memory().unwrap();
        db.with(|c| {
            let today = parse_date("2026-01-01")?;
            let p = create(c, input(c, 10_000, 3, "2026-01-31"), today)?;
            let parts = parcels(c, p.id)?;
            assert_eq!(parts.iter().map(|t| t.date.as_str()).collect::<Vec<_>>(), vec!["2026-01-31", "2026-02-28", "2026-03-31"]);

            // parcelas não podem ser excluídas individualmente
            assert!(transactions::delete(c, parts[0].id).is_err());

            let p = update(c, p.id, input(c, 10_000, 4, "2026-02-01"), today)?;
            assert_eq!(parcels(c, p.id)?.len(), 4);
            assert_eq!(parcels(c, p.id)?.iter().map(|t| t.amount_cents).sum::<i64>(), 10_000);

            delete(c, p.id)?;
            let n: i64 = c.query_row("SELECT COUNT(*) FROM transactions", [], |r| r.get(0))?;
            assert_eq!(n, 0);
            Ok(())
        })
        .unwrap();
    }

    #[test]
    fn rejects_invalid_plans() {
        let db = Db::open_in_memory().unwrap();
        db.with(|c| {
            let today = parse_date("2026-01-01")?;
            assert!(create(c, input(c, 10_000, 1, "2026-01-01"), today).is_err());
            assert!(create(c, input(c, 3, 6, "2026-01-01"), today).is_err());
            let mut bad = input(c, 10_000, 2, "2026-01-01");
            bad.category_id = cat(c, "Salário", Kind::Income);
            assert!(create(c, bad, today).is_err());
            Ok(())
        })
        .unwrap();
    }
}
