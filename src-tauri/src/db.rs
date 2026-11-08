//! Conexão SQLite e migrações versionadas (`PRAGMA user_version`).

use std::path::{Path, PathBuf};
use std::sync::Mutex;

use rusqlite::Connection;

use crate::error::{AppError, AppResult};

/// Migrações embutidas no executável. Nunca altere uma migração já publicada:
/// adicione um novo arquivo ao final da lista.
const MIGRATIONS: &[&str] = &[
    include_str!("../migrations/0001_initial.sql"),
    include_str!("../migrations/0002_paint_palette.sql"),
];

pub const SCHEMA_VERSION: i64 = MIGRATIONS.len() as i64;

pub struct Db {
    conn: Mutex<Connection>,
    pub path: PathBuf,
}

impl Db {
    pub fn open(path: &Path) -> AppResult<Self> {
        if let Some(dir) = path.parent() {
            std::fs::create_dir_all(dir)?;
        }
        let mut conn = Connection::open(path)?;
        configure(&conn)?;
        migrate(&mut conn)?;
        Ok(Self { conn: Mutex::new(conn), path: path.to_path_buf() })
    }

    #[cfg(test)]
    pub fn open_in_memory() -> AppResult<Self> {
        let mut conn = Connection::open_in_memory()?;
        configure(&conn)?;
        migrate(&mut conn)?;
        Ok(Self { conn: Mutex::new(conn), path: PathBuf::from(":memory:") })
    }

    /// Executa `f` com acesso exclusivo à conexão.
    pub fn with<T>(&self, f: impl FnOnce(&mut Connection) -> AppResult<T>) -> AppResult<T> {
        let mut guard = self
            .conn
            .lock()
            .map_err(|_| AppError::Internal("Falha ao acessar o banco de dados.".into()))?;
        f(&mut guard)
    }
}

pub fn configure(conn: &Connection) -> AppResult<()> {
    conn.pragma_update(None, "foreign_keys", "ON")?;
    conn.pragma_update(None, "busy_timeout", 5000)?;
    // WAL só se aplica a arquivos; em memória o pragma é ignorado.
    conn.query_row("PRAGMA journal_mode = WAL", [], |_| Ok(()))?;
    conn.pragma_update(None, "synchronous", "NORMAL")?;
    Ok(())
}

pub fn schema_version(conn: &Connection) -> AppResult<i64> {
    Ok(conn.query_row("PRAGMA user_version", [], |r| r.get(0))?)
}

pub fn migrate(conn: &mut Connection) -> AppResult<()> {
    let current = schema_version(conn)?;
    if current > SCHEMA_VERSION {
        return Err(AppError::Conflict(
            "Este banco de dados foi criado por uma versão mais nova do WCKD. Atualize o aplicativo."
                .into(),
        ));
    }
    for (i, sql) in MIGRATIONS.iter().enumerate().skip(current as usize) {
        let tx = conn.transaction()?;
        tx.execute_batch(sql)?;
        tx.pragma_update(None, "user_version", (i + 1) as i64)?;
        tx.commit()?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn migrations_are_idempotent_and_seed_categories() {
        let db = Db::open_in_memory().unwrap();
        db.with(|c| {
            migrate(c)?; // segunda execução não deve fazer nada
            assert_eq!(schema_version(c)?, SCHEMA_VERSION);
            let n: i64 = c.query_row("SELECT COUNT(*) FROM categories", [], |r| r.get(0))?;
            assert_eq!(n, 18);
            let color: String = c.query_row(
                "SELECT color FROM categories WHERE name = 'Transporte' AND kind = 'expense'",
                [],
                |r| r.get(0),
            )?;
            assert_eq!(color, "#0000FF", "migração 0002 aplica a paleta nova");
            Ok(())
        })
        .unwrap();
    }

    #[test]
    fn persists_after_reopen() {
        let dir = std::env::temp_dir().join(format!("wckd-test-{}", std::process::id()));
        let path = dir.join("persist.db");
        let _ = std::fs::remove_file(&path);
        {
            let db = Db::open(&path).unwrap();
            db.with(|c| {
                c.execute("INSERT INTO settings (key, value) VALUES ('probe', 'ok')", [])?;
                Ok(())
            })
            .unwrap();
        }
        let db = Db::open(&path).unwrap();
        let v: String = db
            .with(|c| Ok(c.query_row("SELECT value FROM settings WHERE key='probe'", [], |r| r.get(0))?))
            .unwrap();
        assert_eq!(v, "ok");
        drop(db);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn foreign_keys_are_enforced() {
        let db = Db::open_in_memory().unwrap();
        let res = db.with(|c| {
            c.execute(
                "INSERT INTO transactions (description, amount_cents, kind, category_id, date)
                 VALUES ('x', 100, 'expense', 9999, '2026-01-01')",
                [],
            )?;
            Ok(())
        });
        assert!(res.is_err());
    }
}
