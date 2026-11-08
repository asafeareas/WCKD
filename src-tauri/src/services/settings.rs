use rusqlite::{Connection, OptionalExtension};
use serde::{Deserialize, Serialize};

use crate::error::{validation, AppResult};
use crate::period::{iso, parse_date};

pub const MAX_AMOUNT_CENTS: i64 = 100_000_000_000; // R$ 1 bilhão

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    /// Dinheiro que você já possuía na data de referência. Não é receita.
    pub initial_balance_cents: i64,
    /// Data de referência do saldo inicial. `None`: considera todas as movimentações.
    pub initial_balance_date: Option<String>,
    /// Oculta valores na interface (privacidade ao compartilhar a tela).
    pub hide_values: bool,
    /// Tema da interface: `light` (padrão) ou `dark`.
    #[serde(default = "default_theme")]
    pub theme: String,
}

fn default_theme() -> String {
    "light".into()
}

fn get(conn: &Connection, key: &str) -> AppResult<Option<String>> {
    Ok(conn
        .query_row("SELECT value FROM settings WHERE key = ?1", [key], |r| r.get(0))
        .optional()?)
}

fn set(conn: &Connection, key: &str, value: Option<&str>) -> AppResult<()> {
    match value {
        Some(v) => conn.execute(
            "INSERT INTO settings (key, value) VALUES (?1, ?2)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            [key, v],
        )?,
        None => conn.execute("DELETE FROM settings WHERE key = ?1", [key])?,
    };
    Ok(())
}

pub fn load(conn: &Connection) -> AppResult<Settings> {
    Ok(Settings {
        initial_balance_cents: get(conn, "initial_balance_cents")?
            .and_then(|v| v.parse().ok())
            .unwrap_or(0),
        initial_balance_date: get(conn, "initial_balance_date")?,
        hide_values: get(conn, "hide_values")?.as_deref() == Some("1"),
        theme: if get(conn, "theme")?.as_deref() == Some("dark") { "dark".into() } else { "light".into() },
    })
}

pub fn save(conn: &mut Connection, input: Settings) -> AppResult<Settings> {
    if input.initial_balance_cents.abs() > MAX_AMOUNT_CENTS {
        return validation("Saldo inicial fora do limite permitido.");
    }
    let date = match input.initial_balance_date.as_deref().map(str::trim) {
        Some(d) if !d.is_empty() => Some(iso(parse_date(d)?)),
        _ => None,
    };
    if date.is_none() && input.initial_balance_cents != 0 {
        return validation("Informe a data de referência do saldo inicial.");
    }
    let tx = conn.transaction()?;
    set(&tx, "initial_balance_cents", Some(&input.initial_balance_cents.to_string()))?;
    set(&tx, "initial_balance_date", date.as_deref())?;
    set(&tx, "hide_values", Some(if input.hide_values { "1" } else { "0" }))?;
    set(&tx, "theme", Some(if input.theme == "dark" { "dark" } else { "light" }))?;
    tx.commit()?;
    load(conn)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::Db;

    #[test]
    fn saves_and_loads() {
        let db = Db::open_in_memory().unwrap();
        db.with(|c| {
            assert_eq!(load(c)?.initial_balance_cents, 0);
            let s = save(
                c,
                Settings {
                    initial_balance_cents: 150_000,
                    initial_balance_date: Some("2026-01-01".into()),
                    hide_values: true,
                    theme: "dark".into(),
                },
            )?;
            assert_eq!(s.initial_balance_cents, 150_000);
            assert_eq!(s.initial_balance_date.as_deref(), Some("2026-01-01"));
            assert!(s.hide_values);
            assert_eq!(s.theme, "dark");
            Ok(())
        })
        .unwrap();
    }

    #[test]
    fn requires_reference_date_for_balance() {
        let db = Db::open_in_memory().unwrap();
        let r = db.with(|c| {
            save(c, Settings { initial_balance_cents: 100, initial_balance_date: None, hide_values: false, theme: "light".into() })
        });
        assert!(r.is_err());
    }
}
