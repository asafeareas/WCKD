//! Exportação CSV (separador `;`, decimal com vírgula, UTF-8 com BOM — abre direto no Excel pt-BR).

use std::fmt::Write as _;
use std::path::Path;

use rusqlite::{params, Connection};

use crate::error::AppResult;
use crate::fmt::{date_br, decimal, month_name};
use crate::models::Kind;
use crate::period::{iso, Month};
use crate::services::dashboard::{balance_at, monthly_series, savings_rate};
use crate::services::transactions::{self, TransactionFilter};

/// Escapa um campo de texto. Também neutraliza fórmulas (=, +, -, @) para evitar injeção no Excel.
fn text(s: &str) -> String {
    let s = if s.starts_with(['=', '+', '-', '@']) { format!("'{s}") } else { s.to_string() };
    if s.contains([';', '"', '\n', '\r']) {
        format!("\"{}\"", s.replace('"', "\"\""))
    } else {
        s
    }
}

fn write(path: &Path, body: String) -> AppResult<()> {
    let mut bytes = Vec::with_capacity(body.len() + 3);
    bytes.extend_from_slice(&[0xEF, 0xBB, 0xBF]);
    bytes.extend_from_slice(body.as_bytes());
    std::fs::write(path, bytes)?;
    Ok(())
}

pub fn transactions_csv(conn: &Connection, filter: TransactionFilter) -> AppResult<String> {
    let mut out = String::from("Data;Descrição;Tipo;Categoria;Valor (R$);Observações\r\n");
    let mut offset = 0;
    loop {
        let page = transactions::list(
            conn,
            TransactionFilter { limit: Some(1000), offset: Some(offset), ..filter.clone() },
        )?;
        for t in &page.items {
            let _ = write!(
                out,
                "{};{};{};{};{};{}\r\n",
                date_br(&t.date),
                text(&t.description),
                t.kind.label(),
                text(&t.category_name),
                decimal(t.amount_cents),
                text(t.notes.as_deref().unwrap_or(""))
            );
        }
        offset += page.items.len() as i64;
        if page.items.is_empty() || offset >= page.total_count {
            break;
        }
    }
    Ok(out)
}

pub fn monthly_summary_csv(conn: &Connection, year: i32) -> AppResult<String> {
    let first = Month::new(year, 1)?;
    let series = monthly_series(conn, first, Month::new(year, 12)?)?;
    let mut out = String::from("Mês;Receitas (R$);Despesas (R$);Resultado (R$);Taxa de economia (%);Saldo no fim do mês (R$)\r\n");
    let (mut ti, mut te) = (0, 0);
    for (i, p) in series.iter().enumerate() {
        let m = first.add(i as i32);
        let rate = savings_rate(p.income_cents, p.expense_cents)
            .map(|r| format!("{r:.1}").replace('.', ","))
            .unwrap_or_default();
        let bal = balance_at(conn, m.last_day())?.map(decimal).unwrap_or_default();
        let _ = write!(
            out,
            "{} de {};{};{};{};{};{}\r\n",
            month_name(m.month),
            year,
            decimal(p.income_cents),
            decimal(p.expense_cents),
            decimal(p.result_cents),
            rate,
            bal
        );
        ti += p.income_cents;
        te += p.expense_cents;
    }
    let rate = savings_rate(ti, te).map(|r| format!("{r:.1}").replace('.', ",")).unwrap_or_default();
    let _ = write!(out, "Total {year};{};{};{};{};\r\n", decimal(ti), decimal(te), decimal(ti - te), rate);
    Ok(out)
}

/// Relatório anual por categoria: uma linha por categoria e uma coluna por mês.
pub fn category_report_csv(conn: &Connection, year: i32) -> AppResult<String> {
    let first = Month::new(year, 1)?;
    let mut out = String::from("Categoria;Tipo");
    for m in 1..=12 {
        let _ = write!(out, ";{}", month_name(m));
    }
    out.push_str(";Total\r\n");

    let mut stmt = conn.prepare(
        "SELECT c.name, c.kind, CAST(substr(t.date, 6, 2) AS INTEGER) AS m, SUM(t.amount_cents)
         FROM transactions t JOIN categories c ON c.id = t.category_id
         WHERE t.date >= ?1 AND t.date < ?2
         GROUP BY c.id, m
         ORDER BY c.kind DESC, c.name COLLATE NOCASE, m",
    )?;
    let rows = stmt
        .query_map(params![iso(first.first_day()), iso(first.add(12).first_day())], |r| {
            Ok((r.get::<_, String>(0)?, r.get::<_, Kind>(1)?, r.get::<_, i64>(2)?, r.get::<_, i64>(3)?))
        })?
        .collect::<Result<Vec<_>, _>>()?;

    let mut current: Option<(String, Kind, [i64; 12])> = None;
    let flush = |out: &mut String, cur: &Option<(String, Kind, [i64; 12])>| {
        if let Some((name, kind, vals)) = cur {
            let _ = write!(out, "{};{}", text(name), kind.label());
            for v in vals {
                let _ = write!(out, ";{}", decimal(*v));
            }
            let _ = write!(out, ";{}\r\n", decimal(vals.iter().sum()));
        }
    };
    for (name, kind, m, total) in rows {
        if current.as_ref().is_none_or(|(n, k, _)| *n != name || *k != kind) {
            flush(&mut out, &current);
            current = Some((name, kind, [0; 12]));
        }
        if let Some((_, _, vals)) = current.as_mut() {
            if (1..=12).contains(&m) {
                vals[(m - 1) as usize] += total;
            }
        }
    }
    flush(&mut out, &current);
    Ok(out)
}

pub fn save(path: &Path, csv: String) -> AppResult<()> {
    write(path, csv)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::Db;
    use crate::services::transactions::tests::add;

    #[test]
    fn escapes_and_neutralizes_formulas() {
        assert_eq!(text("Mercado"), "Mercado");
        assert_eq!(text("a;b"), "\"a;b\"");
        assert_eq!(text("say \"hi\"; ok"), "\"say \"\"hi\"\"; ok\"");
        assert_eq!(text("=SUM(A1)"), "'=SUM(A1)");
    }

    #[test]
    fn exports_csvs() {
        let db = Db::open_in_memory().unwrap();
        db.with(|c| {
            add(c, "Salário", 300_000, Kind::Income, "Salário", "2026-01-05");
            add(c, "Mercado; feira", 12_345, Kind::Expense, "Alimentação", "2026-01-20");
            let csv = transactions_csv(c, TransactionFilter::default())?;
            assert!(csv.contains("20/01/2026;\"Mercado; feira\";Despesa;Alimentação;123,45;"));
            assert_eq!(csv.lines().count(), 3);

            let s = monthly_summary_csv(c, 2026)?;
            assert!(s.contains("janeiro de 2026;3000,00;123,45;2876,55;95,9;2876,55"));
            assert_eq!(s.lines().count(), 14);

            let r = category_report_csv(c, 2026)?;
            assert!(r.contains("Alimentação;Despesa;123,45;0,00"));
            Ok(())
        })
        .unwrap();
    }
}
