use rusqlite::types::Value;
use rusqlite::{params, params_from_iter, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};

use crate::error::{validation, AppError, AppResult};
use crate::models::{Kind, Transaction};
use crate::period::{iso, parse_date};
use crate::services::categories::ensure_kind;
use crate::services::settings::MAX_AMOUNT_CENTS;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TransactionInput {
    pub description: String,
    pub amount_cents: i64,
    pub kind: Kind,
    pub category_id: i64,
    pub date: String,
    pub notes: Option<String>,
}

#[derive(Debug, Clone, Copy, Default, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SortOrder {
    #[default]
    DateDesc,
    DateAsc,
    AmountDesc,
    AmountAsc,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct TransactionFilter {
    pub search: Option<String>,
    pub kind: Option<Kind>,
    pub category_id: Option<i64>,
    /// Inclusivo, `YYYY-MM-DD`.
    pub start_date: Option<String>,
    /// Inclusivo, `YYYY-MM-DD`.
    pub end_date: Option<String>,
    pub sort: SortOrder,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TransactionPage {
    pub items: Vec<Transaction>,
    /// Total de registros que atendem ao filtro (para paginação).
    pub total_count: i64,
    pub income_cents: i64,
    pub expense_cents: i64,
}

pub const SELECT: &str = "
    SELECT t.id, t.description, t.amount_cents, t.kind, t.category_id, c.name, c.color, c.icon,
           t.date, t.notes, t.recurring_id, t.installment_plan_id, t.installment_number,
           p.installment_count, t.created_at, t.updated_at
    FROM transactions t
    JOIN categories c ON c.id = t.category_id
    LEFT JOIN installment_plans p ON p.id = t.installment_plan_id";

pub fn map(r: &rusqlite::Row) -> rusqlite::Result<Transaction> {
    Ok(Transaction {
        id: r.get(0)?,
        description: r.get(1)?,
        amount_cents: r.get(2)?,
        kind: r.get(3)?,
        category_id: r.get(4)?,
        category_name: r.get(5)?,
        category_color: r.get(6)?,
        category_icon: r.get(7)?,
        date: r.get(8)?,
        notes: r.get(9)?,
        recurring_id: r.get(10)?,
        installment_plan_id: r.get(11)?,
        installment_number: r.get(12)?,
        installment_count: r.get(13)?,
        created_at: r.get(14)?,
        updated_at: r.get(15)?,
    })
}

pub fn get(conn: &Connection, id: i64) -> AppResult<Transaction> {
    conn.query_row(&format!("{SELECT} WHERE t.id = ?1"), [id], map)
        .optional()?
        .ok_or_else(|| AppError::NotFound("Movimentação não encontrada.".into()))
}

pub struct Clean {
    pub description: String,
    pub date: String,
    pub notes: Option<String>,
}

pub fn validate_amount(amount_cents: i64) -> AppResult<()> {
    if amount_cents <= 0 {
        return validation("O valor deve ser maior que zero.");
    }
    if amount_cents > MAX_AMOUNT_CENTS {
        return validation("O valor excede o limite permitido.");
    }
    Ok(())
}

pub fn clean_text(description: &str, notes: Option<&str>) -> AppResult<(String, Option<String>)> {
    let description = description.trim().to_string();
    if description.is_empty() {
        return validation("Informe a descrição.");
    }
    if description.chars().count() > 120 {
        return validation("A descrição deve ter no máximo 120 caracteres.");
    }
    let notes = notes.map(str::trim).filter(|n| !n.is_empty()).map(String::from);
    if notes.as_ref().is_some_and(|n| n.chars().count() > 1000) {
        return validation("As observações devem ter no máximo 1000 caracteres.");
    }
    Ok((description, notes))
}

fn validate(conn: &Connection, input: &TransactionInput) -> AppResult<Clean> {
    let (description, notes) = clean_text(&input.description, input.notes.as_deref())?;
    validate_amount(input.amount_cents)?;
    let date = iso(parse_date(&input.date)?);
    ensure_kind(conn, input.category_id, input.kind)?;
    Ok(Clean { description, date, notes })
}

pub fn create(conn: &Connection, input: TransactionInput) -> AppResult<Transaction> {
    let c = validate(conn, &input)?;
    conn.execute(
        "INSERT INTO transactions (description, amount_cents, kind, category_id, date, notes)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![c.description, input.amount_cents, input.kind, input.category_id, c.date, c.notes],
    )?;
    get(conn, conn.last_insert_rowid())
}

pub fn update(conn: &Connection, id: i64, input: TransactionInput) -> AppResult<Transaction> {
    let current = get(conn, id)?;
    let c = validate(conn, &input)?;
    if current.installment_plan_id.is_some()
        && (current.amount_cents != input.amount_cents || current.kind != input.kind)
    {
        return validation(
            "O valor desta parcela é definido pelo parcelamento. Edite o parcelamento para alterá-lo.",
        );
    }
    conn.execute(
        "UPDATE transactions
         SET description = ?1, amount_cents = ?2, kind = ?3, category_id = ?4, date = ?5, notes = ?6,
             updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
         WHERE id = ?7",
        params![c.description, input.amount_cents, input.kind, input.category_id, c.date, c.notes, id],
    )?;
    get(conn, id)
}

pub fn delete(conn: &Connection, id: i64) -> AppResult<()> {
    let current = get(conn, id)?;
    if current.installment_plan_id.is_some() {
        return validation(
            "Esta movimentação é uma parcela. Para removê-la, edite ou exclua o parcelamento.",
        );
    }
    conn.execute("DELETE FROM transactions WHERE id = ?1", [id])?;
    Ok(())
}

pub fn list(conn: &Connection, f: TransactionFilter) -> AppResult<TransactionPage> {
    let mut where_sql = String::from(" WHERE 1 = 1");
    let mut args: Vec<Value> = Vec::new();

    if let Some(s) = f.search.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
        args.push(Value::Text(s.to_lowercase()));
        where_sql.push_str(&format!(
            " AND (instr(lower(t.description), ?{0}) > 0 OR instr(lower(COALESCE(t.notes, '')), ?{0}) > 0)",
            args.len()
        ));
    }
    if let Some(k) = f.kind {
        args.push(Value::Text(k.as_str().into()));
        where_sql.push_str(&format!(" AND t.kind = ?{}", args.len()));
    }
    if let Some(cid) = f.category_id {
        args.push(Value::Integer(cid));
        where_sql.push_str(&format!(" AND t.category_id = ?{}", args.len()));
    }
    if let Some(d) = f.start_date.as_deref().filter(|d| !d.is_empty()) {
        args.push(Value::Text(iso(parse_date(d)?)));
        where_sql.push_str(&format!(" AND t.date >= ?{}", args.len()));
    }
    if let Some(d) = f.end_date.as_deref().filter(|d| !d.is_empty()) {
        args.push(Value::Text(iso(parse_date(d)?)));
        where_sql.push_str(&format!(" AND t.date <= ?{}", args.len()));
    }

    let (total_count, income_cents, expense_cents): (i64, i64, i64) = conn.query_row(
        &format!(
            "SELECT COUNT(*),
                    COALESCE(SUM(CASE WHEN t.kind = 'income' THEN t.amount_cents END), 0),
                    COALESCE(SUM(CASE WHEN t.kind = 'expense' THEN t.amount_cents END), 0)
             FROM transactions t {where_sql}"
        ),
        params_from_iter(args.iter()),
        |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
    )?;

    let order = match f.sort {
        SortOrder::DateDesc => "t.date DESC, t.id DESC",
        SortOrder::DateAsc => "t.date ASC, t.id ASC",
        SortOrder::AmountDesc => "t.amount_cents DESC, t.date DESC",
        SortOrder::AmountAsc => "t.amount_cents ASC, t.date DESC",
    };
    let limit = f.limit.unwrap_or(200).clamp(1, 10_000);
    let offset = f.offset.unwrap_or(0).max(0);
    let mut stmt =
        conn.prepare(&format!("{SELECT} {where_sql} ORDER BY {order} LIMIT {limit} OFFSET {offset}"))?;
    let items = stmt
        .query_map(params_from_iter(args.iter()), map)?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(TransactionPage { items, total_count, income_cents, expense_cents })
}

#[cfg(test)]
pub mod tests {
    use super::*;
    use crate::db::Db;

    pub fn cat(c: &Connection, name: &str, kind: Kind) -> i64 {
        c.query_row("SELECT id FROM categories WHERE name = ?1 AND kind = ?2", params![name, kind], |r| r.get(0))
            .unwrap()
    }

    pub fn add(c: &Connection, desc: &str, cents: i64, kind: Kind, cat_name: &str, date: &str) -> Transaction {
        let category_id = cat(c, cat_name, kind);
        create(
            c,
            TransactionInput {
                description: desc.into(),
                amount_cents: cents,
                kind,
                category_id,
                date: date.into(),
                notes: None,
            },
        )
        .unwrap()
    }

    #[test]
    fn crud_roundtrip() {
        let db = Db::open_in_memory().unwrap();
        db.with(|c| {
            let t = add(c, "  Mercado  ", 12345, Kind::Expense, "Alimentação", "2026-03-05");
            assert_eq!(t.description, "Mercado");
            assert_eq!(t.category_name, "Alimentação");

            let mut input = TransactionInput {
                description: "Mercado do mês".into(),
                amount_cents: 20000,
                kind: Kind::Expense,
                category_id: t.category_id,
                date: "2026-03-06".into(),
                notes: Some("  ".into()),
            };
            let u = update(c, t.id, input.clone())?;
            assert_eq!(u.amount_cents, 20000);
            assert_eq!(u.notes, None);

            input.kind = Kind::Income; // categoria de despesa com tipo receita
            assert!(update(c, t.id, input).is_err());

            delete(c, t.id)?;
            assert!(get(c, t.id).is_err());
            Ok(())
        })
        .unwrap();
    }

    #[test]
    fn validation_rejects_bad_input() {
        let db = Db::open_in_memory().unwrap();
        db.with(|c| {
            let cid = cat(c, "Lazer", Kind::Expense);
            let base = TransactionInput {
                description: "Cinema".into(),
                amount_cents: 3000,
                kind: Kind::Expense,
                category_id: cid,
                date: "2026-03-05".into(),
                notes: None,
            };
            assert!(create(c, TransactionInput { amount_cents: 0, ..base.clone() }).is_err());
            assert!(create(c, TransactionInput { amount_cents: -5, ..base.clone() }).is_err());
            assert!(create(c, TransactionInput { description: " ".into(), ..base.clone() }).is_err());
            assert!(create(c, TransactionInput { date: "2026-02-31".into(), ..base.clone() }).is_err());
            assert!(create(c, TransactionInput { category_id: 99999, ..base.clone() }).is_err());
            Ok(())
        })
        .unwrap();
    }

    #[test]
    fn filters_sort_and_totals() {
        let db = Db::open_in_memory().unwrap();
        db.with(|c| {
            add(c, "Salário março", 500000, Kind::Income, "Salário", "2026-03-01");
            add(c, "Uber", 2500, Kind::Expense, "Transporte", "2026-03-02");
            add(c, "Mercado", 30000, Kind::Expense, "Alimentação", "2026-03-31");
            add(c, "Padaria", 1500, Kind::Expense, "Alimentação", "2026-04-01");

            let march = TransactionFilter {
                start_date: Some("2026-03-01".into()),
                end_date: Some("2026-03-31".into()),
                ..Default::default()
            };
            let p = list(c, march.clone())?;
            assert_eq!(p.total_count, 3);
            assert_eq!(p.income_cents, 500000);
            assert_eq!(p.expense_cents, 32500);
            assert_eq!(p.items[0].description, "Mercado"); // data desc

            let p = list(c, TransactionFilter { kind: Some(Kind::Expense), sort: SortOrder::AmountAsc, ..march.clone() })?;
            assert_eq!(p.items.iter().map(|t| t.amount_cents).collect::<Vec<_>>(), vec![2500, 30000]);

            let p = list(c, TransactionFilter { search: Some("MERC".into()), ..Default::default() })?;
            assert_eq!(p.total_count, 1);

            let food = cat(c, "Alimentação", Kind::Expense);
            let p = list(c, TransactionFilter { category_id: Some(food), ..Default::default() })?;
            assert_eq!(p.total_count, 2);
            Ok(())
        })
        .unwrap();
    }
}
