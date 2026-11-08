//! Backup completo (cópia consistente do banco SQLite) e restauração validada.

use std::path::{Path, PathBuf};
use std::time::Duration;

use rusqlite::{Connection, OpenFlags};
use serde::Serialize;

use crate::db::{self, SCHEMA_VERSION};
use crate::error::{AppError, AppResult};

const REQUIRED_TABLES: &[&str] =
    &["settings", "categories", "transactions", "recurring_expenses", "installment_plans", "budgets"];

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupInfo {
    pub path: String,
    pub schema_version: i64,
    pub file_size_bytes: u64,
    pub transaction_count: i64,
    pub category_count: i64,
    pub first_date: Option<String>,
    pub last_date: Option<String>,
}

/// Grava uma cópia consistente do banco em `dest` (substitui o arquivo, se existir).
pub fn export(conn: &Connection, dest: &Path) -> AppResult<()> {
    let tmp = dest.with_extension("wckd-tmp");
    let _ = std::fs::remove_file(&tmp);
    conn.execute("VACUUM INTO ?1", [tmp.to_string_lossy()])?;
    // Valida a cópia antes de substituir o destino.
    if let Err(e) = inspect(&tmp) {
        let _ = std::fs::remove_file(&tmp);
        return Err(e);
    }
    std::fs::rename(&tmp, dest)?;
    Ok(())
}

/// Abre um arquivo de backup somente leitura e valida integridade e compatibilidade.
pub fn inspect(path: &Path) -> AppResult<BackupInfo> {
    let invalid = || AppError::Validation("O arquivo selecionado não é um backup válido do WCKD.".into());
    let meta = std::fs::metadata(path)?;
    let src = Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX)
        .map_err(|_| invalid())?;

    let integrity: String = src.query_row("PRAGMA integrity_check", [], |r| r.get(0)).map_err(|_| invalid())?;
    if integrity != "ok" {
        return Err(AppError::Validation("O backup está corrompido (falha na verificação de integridade).".into()));
    }
    let version = db::schema_version(&src).map_err(|_| invalid())?;
    if version < 1 {
        return Err(invalid());
    }
    if version > SCHEMA_VERSION {
        return Err(AppError::Validation(
            "Este backup foi criado por uma versão mais nova do WCKD. Atualize o aplicativo para restaurá-lo.".into(),
        ));
    }
    for t in REQUIRED_TABLES {
        let exists: bool = src.query_row(
            "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?1)",
            [t],
            |r| r.get(0),
        )?;
        if !exists {
            return Err(invalid());
        }
    }
    let fk_errors: i64 = src.query_row("SELECT COUNT(*) FROM pragma_foreign_key_check", [], |r| r.get(0))?;
    if fk_errors > 0 {
        return Err(AppError::Validation("O backup possui registros com relacionamentos inválidos.".into()));
    }
    let (transaction_count, first_date, last_date): (i64, Option<String>, Option<String>) = src.query_row(
        "SELECT COUNT(*), MIN(date), MAX(date) FROM transactions",
        [],
        |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
    )?;
    let category_count: i64 = src.query_row("SELECT COUNT(*) FROM categories", [], |r| r.get(0))?;

    Ok(BackupInfo {
        path: path.to_string_lossy().into_owned(),
        schema_version: version,
        file_size_bytes: meta.len(),
        transaction_count,
        category_count,
        first_date,
        last_date,
    })
}

/// Restaura um backup sobre o banco atual. Antes, salva uma cópia de segurança do banco atual
/// em `safety_dir` e retorna o caminho dessa cópia.
pub fn restore(conn: &mut Connection, src_path: &Path, safety_dir: &Path) -> AppResult<PathBuf> {
    inspect(src_path)?;
    std::fs::create_dir_all(safety_dir)?;
    let stamp = chrono::Local::now().format("%Y%m%d-%H%M%S");
    let safety = safety_dir.join(format!("antes-da-restauracao-{stamp}.wckd"));
    export(conn, &safety)?;

    let src = Connection::open_with_flags(src_path, OpenFlags::SQLITE_OPEN_READ_ONLY)?;
    {
        let backup = rusqlite::backup::Backup::new(&src, conn)?;
        backup.run_to_completion(256, Duration::from_millis(0), None)?;
    }
    db::configure(conn)?;
    db::migrate(conn)?;
    Ok(safety)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::Db;
    use crate::models::Kind;
    use crate::services::transactions::tests::add;

    fn tmp_dir(name: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("wckd-backup-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&d);
        std::fs::create_dir_all(&d).unwrap();
        d
    }

    #[test]
    fn export_inspect_restore_roundtrip() {
        let dir = tmp_dir("roundtrip");
        let file = dir.join("backup.wckd");
        let db = Db::open(&dir.join("live.db")).unwrap();
        db.with(|c| {
            add(c, "Salário", 500_000, Kind::Income, "Salário", "2026-01-05");
            add(c, "Mercado", 40_000, Kind::Expense, "Alimentação", "2026-01-20");
            export(c, &file)?;
            let info = inspect(&file)?;
            assert_eq!(info.transaction_count, 2);
            assert_eq!(info.first_date.as_deref(), Some("2026-01-05"));

            // Alterações depois do backup são desfeitas pela restauração
            add(c, "Depois do backup", 1_000, Kind::Expense, "Lazer", "2026-02-01");
            let safety = restore(c, &file, &dir.join("safety"))?;
            assert!(safety.exists());
            let n: i64 = c.query_row("SELECT COUNT(*) FROM transactions", [], |r| r.get(0))?;
            assert_eq!(n, 2);
            // A cópia de segurança contém o estado anterior (3 transações)
            assert_eq!(inspect(&safety)?.transaction_count, 3);
            // Integridade referencial continua ativa após a restauração
            let fk: i64 = c.query_row("PRAGMA foreign_keys", [], |r| r.get(0))?;
            assert_eq!(fk, 1);
            Ok(())
        })
        .unwrap();
        drop(db);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn rejects_non_backup_files() {
        let dir = tmp_dir("invalid");
        let junk = dir.join("junk.wckd");
        std::fs::write(&junk, b"isto nao e um banco sqlite, apenas texto qualquer....").unwrap();
        assert!(inspect(&junk).is_err());

        let other = dir.join("other.db");
        let c = Connection::open(&other).unwrap();
        c.execute_batch("CREATE TABLE foo (x INTEGER);").unwrap();
        drop(c);
        assert!(inspect(&other).is_err());
        let _ = std::fs::remove_dir_all(&dir);
    }
}
