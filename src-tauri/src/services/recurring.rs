//! Contas recorrentes. Um cadastro recorrente é apenas uma PREVISÃO: nenhuma despesa é
//! contabilizada até que você marque um vencimento como pago. O pagamento cria uma transação
//! vinculada a (conta, data de vencimento), protegida por índice único contra duplicação.

use std::collections::HashMap;

use chrono::NaiveDate;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};

use crate::error::{is_unique_violation, validation, AppError, AppResult};
use crate::models::{Kind, Transaction};
use crate::period::{add_days, add_months, iso, parse_date, Month};
use crate::services::categories::ensure_kind;
use crate::services::transactions::{self, clean_text, validate_amount};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Frequency {
    Weekly,
    Monthly,
    Yearly,
}

impl Frequency {
    fn as_str(self) -> &'static str {
        match self {
            Frequency::Weekly => "weekly",
            Frequency::Monthly => "monthly",
            Frequency::Yearly => "yearly",
        }
    }
    fn parse(s: &str) -> Self {
        match s {
            "weekly" => Frequency::Weekly,
            "yearly" => Frequency::Yearly,
            _ => Frequency::Monthly,
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecurringInput {
    pub name: String,
    pub amount_cents: i64,
    pub category_id: i64,
    pub frequency: Frequency,
    /// Primeiro vencimento (define o dia de vencimento).
    pub start_date: String,
    pub end_date: Option<String>,
    pub notes: Option<String>,
    pub active: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum OccurrenceStatus {
    Paid,
    Pending,
    Overdue,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Occurrence {
    pub recurring_id: i64,
    pub name: String,
    pub category_name: String,
    pub category_color: String,
    pub category_icon: String,
    pub due_date: String,
    pub expected_cents: i64,
    pub status: OccurrenceStatus,
    pub transaction_id: Option<i64>,
    pub paid_cents: Option<i64>,
    pub paid_date: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Recurring {
    pub id: i64,
    pub name: String,
    pub amount_cents: i64,
    pub category_id: i64,
    pub category_name: String,
    pub category_color: String,
    pub category_icon: String,
    pub frequency: Frequency,
    pub start_date: String,
    pub end_date: Option<String>,
    pub notes: Option<String>,
    pub active: bool,
    pub monthly_equivalent_cents: i64,
    pub payment_count: i64,
    pub next_due_date: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecurringOverview {
    pub month: String,
    pub items: Vec<Recurring>,
    /// Vencimentos do mês selecionado (pagos e pendentes).
    pub month_occurrences: Vec<Occurrence>,
    /// Vencimentos não pagos nos próximos 30 dias.
    pub upcoming: Vec<Occurrence>,
    /// Vencimentos não pagos dos últimos 90 dias.
    pub overdue: Vec<Occurrence>,
    pub monthly_total_cents: i64,
    pub month_expected_cents: i64,
    pub month_paid_cents: i64,
    pub month_pending_cents: i64,
}

pub fn monthly_equivalent(amount: i64, f: Frequency) -> i64 {
    match f {
        Frequency::Weekly => amount * 52 / 12,
        Frequency::Monthly => amount,
        Frequency::Yearly => amount / 12,
    }
}

fn occurrence_at(start: NaiveDate, f: Frequency, k: i64) -> NaiveDate {
    match f {
        Frequency::Weekly => add_days(start, 7 * k as u64),
        Frequency::Monthly => add_months(start, k as u32),
        Frequency::Yearly => add_months(start, 12 * k as u32),
    }
}

/// Datas de vencimento em [from, to] (inclusivo).
pub fn occurrences(start: NaiveDate, end: Option<NaiveDate>, f: Frequency, from: NaiveDate, to: NaiveDate) -> Vec<NaiveDate> {
    let to = end.map_or(to, |e| e.min(to));
    if to < start || to < from {
        return Vec::new();
    }
    // Começa um pouco antes do intervalo para não iterar desde o início do cadastro.
    let mut k = if from > start {
        let k = match f {
            Frequency::Weekly => (from - start).num_days() / 7,
            Frequency::Monthly => Month::from_date(from).diff(Month::from_date(start)) as i64,
            Frequency::Yearly => Month::from_date(from).diff(Month::from_date(start)) as i64 / 12,
        };
        (k - 1).max(0)
    } else {
        0
    };
    let mut out = Vec::new();
    loop {
        let d = occurrence_at(start, f, k);
        if d > to {
            break;
        }
        if d >= from {
            out.push(d);
        }
        k += 1;
    }
    out
}

const SELECT: &str = "
    SELECT r.id, r.name, r.amount_cents, r.category_id, c.name, c.color, c.icon, r.frequency,
           r.start_date, r.end_date, r.notes, r.active,
           (SELECT COUNT(*) FROM transactions t WHERE t.recurring_id = r.id)
    FROM recurring_expenses r JOIN categories c ON c.id = r.category_id";

fn map(r: &rusqlite::Row) -> rusqlite::Result<Recurring> {
    let amount: i64 = r.get(2)?;
    let f = Frequency::parse(&r.get::<_, String>(7)?);
    Ok(Recurring {
        id: r.get(0)?,
        name: r.get(1)?,
        amount_cents: amount,
        category_id: r.get(3)?,
        category_name: r.get(4)?,
        category_color: r.get(5)?,
        category_icon: r.get(6)?,
        frequency: f,
        start_date: r.get(8)?,
        end_date: r.get(9)?,
        notes: r.get(10)?,
        active: r.get::<_, i64>(11)? == 1,
        monthly_equivalent_cents: monthly_equivalent(amount, f),
        payment_count: r.get(12)?,
        next_due_date: None,
    })
}

fn dates(r: &Recurring) -> AppResult<(NaiveDate, Option<NaiveDate>)> {
    Ok((parse_date(&r.start_date)?, r.end_date.as_deref().map(parse_date).transpose()?))
}

/// Pagamentos registrados: (recurring_id, due_date) -> (transaction_id, valor, data paga)
/// (recurring_id, due_date) -> (transaction_id, valor pago, data do pagamento)
type Payments = HashMap<(i64, String), (i64, i64, String)>;

fn payments(conn: &Connection, from: &str, to: &str) -> AppResult<Payments> {
    let mut stmt = conn.prepare_cached(
        "SELECT recurring_id, recurring_due_date, id, amount_cents, date FROM transactions
         WHERE recurring_id IS NOT NULL AND recurring_due_date >= ?1 AND recurring_due_date <= ?2",
    )?;
    let rows = stmt
        .query_map(params![from, to], |r| Ok(((r.get(0)?, r.get(1)?), (r.get(2)?, r.get(3)?, r.get(4)?))))?
        .collect::<Result<_, _>>()?;
    Ok(rows)
}

fn build_occurrences(
    items: &[Recurring],
    from: NaiveDate,
    to: NaiveDate,
    paid: &Payments,
    today: NaiveDate,
    include_inactive: bool,
) -> AppResult<Vec<Occurrence>> {
    let mut out = Vec::new();
    for r in items.iter().filter(|r| include_inactive || r.active) {
        let (start, end) = dates(r)?;
        for d in occurrences(start, end, r.frequency, from, to) {
            let key = (r.id, iso(d));
            let p = paid.get(&key);
            let status = match p {
                Some(_) => OccurrenceStatus::Paid,
                None if d < today => OccurrenceStatus::Overdue,
                None => OccurrenceStatus::Pending,
            };
            out.push(Occurrence {
                recurring_id: r.id,
                name: r.name.clone(),
                category_name: r.category_name.clone(),
                category_color: r.category_color.clone(),
                category_icon: r.category_icon.clone(),
                due_date: key.1,
                expected_cents: r.amount_cents,
                status,
                transaction_id: p.map(|p| p.0),
                paid_cents: p.map(|p| p.1),
                paid_date: p.map(|p| p.2.clone()),
            });
        }
    }
    out.sort_by(|a, b| a.due_date.cmp(&b.due_date).then(a.name.cmp(&b.name)));
    Ok(out)
}

pub fn list(conn: &Connection, today: NaiveDate) -> AppResult<Vec<Recurring>> {
    let mut stmt = conn.prepare_cached(&format!("{SELECT} ORDER BY r.active DESC, r.name COLLATE NOCASE"))?;
    let mut items = stmt.query_map([], map)?.collect::<Result<Vec<_>, _>>()?;
    // Próximo vencimento não pago a partir de hoje (até 2 anos à frente).
    let horizon = add_months(today, 24);
    let paid = payments(conn, &iso(today), &iso(horizon))?;
    for r in &mut items {
        if !r.active {
            continue;
        }
        let (start, end) = dates(r)?;
        r.next_due_date = occurrences(start, end, r.frequency, today, horizon)
            .into_iter()
            .map(iso)
            .find(|d| !paid.contains_key(&(r.id, d.clone())));
    }
    Ok(items)
}

pub fn get(conn: &Connection, id: i64) -> AppResult<Recurring> {
    conn.query_row(&format!("{SELECT} WHERE r.id = ?1"), [id], map)
        .optional()?
        .ok_or_else(|| AppError::NotFound("Conta recorrente não encontrada.".into()))
}

pub fn overview(conn: &Connection, month: Month, today: NaiveDate) -> AppResult<RecurringOverview> {
    let items = list(conn, today)?;
    let (mf, ml) = (month.first_day(), month.last_day());
    let overdue_from = today.checked_sub_days(chrono::Days::new(90)).expect("data válida");
    let upcoming_to = add_days(today, 30);
    let lo = mf.min(overdue_from);
    let hi = ml.max(upcoming_to);
    let paid = payments(conn, &iso(lo), &iso(hi))?;

    // Meses passados mostram também contas hoje inativas (histórico); demais, só ativas.
    let month_occurrences = build_occurrences(&items, mf, ml, &paid, today, true)?
        .into_iter()
        .filter(|o| o.status == OccurrenceStatus::Paid || items.iter().any(|r| r.id == o.recurring_id && r.active))
        .collect::<Vec<_>>();
    let upcoming = build_occurrences(&items, today, upcoming_to, &paid, today, false)?
        .into_iter()
        .filter(|o| o.status != OccurrenceStatus::Paid)
        .collect();
    let overdue = build_occurrences(&items, overdue_from, today, &paid, today, false)?
        .into_iter()
        .filter(|o| o.status == OccurrenceStatus::Overdue)
        .collect();

    let month_expected = month_occurrences.iter().map(|o| o.expected_cents).sum();
    let month_paid = month_occurrences.iter().filter_map(|o| o.paid_cents).sum();
    let month_pending = month_occurrences
        .iter()
        .filter(|o| o.status != OccurrenceStatus::Paid)
        .map(|o| o.expected_cents)
        .sum();
    let monthly_total = items.iter().filter(|r| r.active).map(|r| r.monthly_equivalent_cents).sum();

    Ok(RecurringOverview {
        month: month.key(),
        items,
        month_occurrences,
        upcoming,
        overdue,
        monthly_total_cents: monthly_total,
        month_expected_cents: month_expected,
        month_paid_cents: month_paid,
        month_pending_cents: month_pending,
    })
}

struct Clean {
    name: String,
    notes: Option<String>,
    start: String,
    end: Option<String>,
}

fn validate(conn: &Connection, input: &RecurringInput) -> AppResult<Clean> {
    let (name, notes) = clean_text(&input.name, input.notes.as_deref())?;
    validate_amount(input.amount_cents)?;
    ensure_kind(conn, input.category_id, Kind::Expense)?;
    let start = parse_date(&input.start_date)?;
    let end = match input.end_date.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
        Some(e) => Some(parse_date(e)?),
        None => None,
    };
    if end.is_some_and(|e| e < start) {
        return validation("A data de término deve ser posterior ao primeiro vencimento.");
    }
    Ok(Clean { name, notes, start: iso(start), end: end.map(iso) })
}

pub fn create(conn: &Connection, input: RecurringInput) -> AppResult<Recurring> {
    let c = validate(conn, &input)?;
    conn.execute(
        "INSERT INTO recurring_expenses (name, amount_cents, category_id, frequency, start_date, end_date, notes, active)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![c.name, input.amount_cents, input.category_id, input.frequency.as_str(), c.start, c.end, c.notes, input.active as i64],
    )?;
    get(conn, conn.last_insert_rowid())
}

pub fn update(conn: &Connection, id: i64, input: RecurringInput) -> AppResult<Recurring> {
    get(conn, id)?;
    let c = validate(conn, &input)?;
    conn.execute(
        "UPDATE recurring_expenses
         SET name = ?1, amount_cents = ?2, category_id = ?3, frequency = ?4, start_date = ?5, end_date = ?6,
             notes = ?7, active = ?8, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
         WHERE id = ?9",
        params![c.name, input.amount_cents, input.category_id, input.frequency.as_str(), c.start, c.end, c.notes, input.active as i64, id],
    )?;
    get(conn, id)
}

/// Exclui o cadastro. Pagamentos já registrados continuam como despesas normais.
pub fn delete(conn: &Connection, id: i64) -> AppResult<()> {
    let n = conn.execute("DELETE FROM recurring_expenses WHERE id = ?1", [id])?;
    if n == 0 {
        return Err(AppError::NotFound("Conta recorrente não encontrada.".into()));
    }
    Ok(())
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PayInput {
    pub recurring_id: i64,
    pub due_date: String,
    pub paid_date: String,
    pub amount_cents: i64,
}

/// Registra o pagamento de um vencimento, criando a despesa correspondente.
pub fn pay(conn: &Connection, input: PayInput) -> AppResult<Transaction> {
    let r = get(conn, input.recurring_id)?;
    validate_amount(input.amount_cents)?;
    let due = parse_date(&input.due_date)?;
    let paid_date = parse_date(&input.paid_date)?;
    let (start, end) = dates(&r)?;
    if !occurrences(start, end, r.frequency, due, due).contains(&due) {
        return validation("Esta data não corresponde a um vencimento desta conta.");
    }
    conn.execute(
        "INSERT INTO transactions (description, amount_cents, kind, category_id, date, recurring_id, recurring_due_date)
         VALUES (?1, ?2, 'expense', ?3, ?4, ?5, ?6)",
        params![r.name, input.amount_cents, r.category_id, iso(paid_date), r.id, iso(due)],
    )
    .map_err(|e| {
        if is_unique_violation(&e) {
            AppError::Conflict("Este vencimento já foi marcado como pago.".into())
        } else {
            e.into()
        }
    })?;
    transactions::get(conn, conn.last_insert_rowid())
}

/// Histórico de pagamentos de uma conta.
pub fn history(conn: &Connection, id: i64) -> AppResult<Vec<Transaction>> {
    let mut stmt = conn.prepare_cached(&format!(
        "{} WHERE t.recurring_id = ?1 ORDER BY t.recurring_due_date DESC",
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

    fn d(s: &str) -> NaiveDate {
        parse_date(s).unwrap()
    }

    fn input(c: &Connection, f: Frequency, start: &str) -> RecurringInput {
        RecurringInput {
            name: "Internet".into(),
            amount_cents: 10_000,
            category_id: cat(c, "Contas", Kind::Expense),
            frequency: f,
            start_date: start.into(),
            end_date: None,
            notes: None,
            active: true,
        }
    }

    #[test]
    fn occurrence_generation() {
        let m = occurrences(d("2026-01-31"), None, Frequency::Monthly, d("2026-02-01"), d("2026-04-30"));
        assert_eq!(m.into_iter().map(iso).collect::<Vec<_>>(), vec!["2026-02-28", "2026-03-31", "2026-04-30"]);
        let w = occurrences(d("2026-01-05"), None, Frequency::Weekly, d("2026-01-01"), d("2026-01-31"));
        assert_eq!(w.len(), 4);
        let y = occurrences(d("2024-02-29"), None, Frequency::Yearly, d("2025-01-01"), d("2026-12-31"));
        assert_eq!(y.into_iter().map(iso).collect::<Vec<_>>(), vec!["2025-02-28", "2026-02-28"]);
        let ended = occurrences(d("2026-01-10"), Some(d("2026-02-10")), Frequency::Monthly, d("2026-01-01"), d("2026-12-31"));
        assert_eq!(ended.len(), 2);
    }

    #[test]
    fn registering_does_not_create_expenses_and_payment_is_unique() {
        let db = Db::open_in_memory().unwrap();
        db.with(|c| {
            let r = create(c, input(c, Frequency::Monthly, "2026-01-10"))?;
            assert_eq!(totals(c, "2026-01-01", "2027-01-01")?.1, 0, "previsão não é despesa realizada");

            let today = d("2026-03-15");
            let o = overview(c, Month::parse("2026-03")?, today)?;
            assert_eq!(o.month_occurrences.len(), 1);
            assert_eq!(o.month_occurrences[0].status, OccurrenceStatus::Overdue);
            assert_eq!(o.month_pending_cents, 10_000);
            assert_eq!(o.overdue.len(), 3); // jan, fev, mar

            let pay_input = || PayInput {
                recurring_id: r.id,
                due_date: "2026-03-10".into(),
                paid_date: "2026-03-12".into(),
                amount_cents: 10_990,
            };
            let t = pay(c, pay_input())?;
            assert_eq!(t.date, "2026-03-12");
            assert!(matches!(pay(c, pay_input()), Err(AppError::Conflict(_))));
            assert!(pay(c, PayInput { due_date: "2026-03-11".into(), ..pay_input() }).is_err());

            let o = overview(c, Month::parse("2026-03")?, today)?;
            assert_eq!(o.month_occurrences[0].status, OccurrenceStatus::Paid);
            assert_eq!(o.month_paid_cents, 10_990);
            assert_eq!(o.month_pending_cents, 0);
            assert_eq!(totals(c, "2026-03-01", "2026-04-01")?.1, 10_990);
            assert_eq!(history(c, r.id)?.len(), 1);

            // Excluir o cadastro preserva o pagamento como despesa
            delete(c, r.id)?;
            assert_eq!(totals(c, "2026-03-01", "2026-04-01")?.1, 10_990);
            Ok(())
        })
        .unwrap();
    }

    #[test]
    fn monthly_equivalents() {
        assert_eq!(monthly_equivalent(1_200, Frequency::Yearly), 100);
        assert_eq!(monthly_equivalent(1_200, Frequency::Weekly), 5_200);
        assert_eq!(monthly_equivalent(1_200, Frequency::Monthly), 1_200);
    }
}
