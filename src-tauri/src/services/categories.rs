use rusqlite::{params, Connection, OptionalExtension};
use serde::Deserialize;

use crate::error::{is_unique_violation, validation, AppError, AppResult};
use crate::models::{Category, Kind};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CategoryInput {
    pub name: String,
    pub kind: Kind,
    pub color: String,
    pub icon: String,
}

const SELECT: &str = "
    SELECT c.id, c.name, c.kind, c.color, c.icon,
           (SELECT COUNT(*) FROM transactions t WHERE t.category_id = c.id),
           (SELECT COUNT(*) FROM recurring_expenses r WHERE r.category_id = c.id)
         + (SELECT COUNT(*) FROM installment_plans p WHERE p.category_id = c.id)
    FROM categories c";

fn map(r: &rusqlite::Row) -> rusqlite::Result<Category> {
    Ok(Category {
        id: r.get(0)?,
        name: r.get(1)?,
        kind: r.get(2)?,
        color: r.get(3)?,
        icon: r.get(4)?,
        transaction_count: r.get(5)?,
        link_count: r.get(6)?,
    })
}

pub fn list(conn: &Connection) -> AppResult<Vec<Category>> {
    let mut stmt = conn.prepare_cached(&format!("{SELECT} ORDER BY c.kind DESC, c.name COLLATE NOCASE"))?;
    let rows = stmt.query_map([], map)?.collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

pub fn get(conn: &Connection, id: i64) -> AppResult<Category> {
    conn.query_row(&format!("{SELECT} WHERE c.id = ?1"), [id], map)
        .optional()?
        .ok_or_else(|| AppError::NotFound("Categoria não encontrada.".into()))
}

/// Garante que a categoria existe e é do tipo esperado.
pub fn ensure_kind(conn: &Connection, id: i64, kind: Kind) -> AppResult<()> {
    let found: Option<Kind> = conn
        .query_row("SELECT kind FROM categories WHERE id = ?1", [id], |r| r.get(0))
        .optional()?;
    match found {
        None => validation("Categoria não encontrada."),
        Some(k) if k != kind => validation(format!(
            "A categoria selecionada não é de {}.",
            if kind == Kind::Income { "receita" } else { "despesa" }
        )),
        _ => Ok(()),
    }
}

fn clean(input: &CategoryInput) -> AppResult<(String, String, String)> {
    let name = input.name.trim().to_string();
    if name.is_empty() {
        return validation("Informe o nome da categoria.");
    }
    if name.chars().count() > 40 {
        return validation("O nome da categoria deve ter no máximo 40 caracteres.");
    }
    let color = input.color.trim().to_string();
    let valid_color = color.len() == 7
        && color.starts_with('#')
        && color[1..].chars().all(|c| c.is_ascii_hexdigit());
    if !valid_color {
        return validation("Cor inválida.");
    }
    let icon = input.icon.trim().to_string();
    if icon.is_empty() || icon.len() > 40 {
        return validation("Ícone inválido.");
    }
    Ok((name, color, icon))
}

fn map_unique(e: rusqlite::Error) -> AppError {
    if is_unique_violation(&e) {
        AppError::Conflict("Já existe uma categoria com esse nome.".into())
    } else {
        e.into()
    }
}

pub fn create(conn: &Connection, input: CategoryInput) -> AppResult<Category> {
    let (name, color, icon) = clean(&input)?;
    conn.execute(
        "INSERT INTO categories (name, kind, color, icon) VALUES (?1, ?2, ?3, ?4)",
        params![name, input.kind, color, icon],
    )
    .map_err(map_unique)?;
    get(conn, conn.last_insert_rowid())
}

/// O tipo (receita/despesa) de uma categoria não pode ser alterado.
pub fn update(conn: &Connection, id: i64, input: CategoryInput) -> AppResult<Category> {
    let current = get(conn, id)?;
    if current.kind != input.kind {
        return validation("Não é possível alterar o tipo de uma categoria.");
    }
    let (name, color, icon) = clean(&input)?;
    conn.execute(
        "UPDATE categories SET name = ?1, color = ?2, icon = ?3 WHERE id = ?4",
        params![name, color, icon, id],
    )
    .map_err(map_unique)?;
    get(conn, id)
}

/// Exclui uma categoria. Se ela estiver em uso, `reassign_to` é obrigatório: transações,
/// contas recorrentes, parcelamentos e orçamentos são movidos para a categoria de destino
/// em uma única transação SQL.
pub fn delete(conn: &mut Connection, id: i64, reassign_to: Option<i64>) -> AppResult<()> {
    let cat = get(conn, id)?;
    let same_kind: i64 = conn.query_row(
        "SELECT COUNT(*) FROM categories WHERE kind = ?1",
        [cat.kind],
        |r| r.get(0),
    )?;
    if same_kind <= 1 {
        return validation("É necessário manter pelo menos uma categoria de cada tipo.");
    }
    let in_use = cat.transaction_count + cat.link_count > 0;
    let tx = conn.transaction()?;
    if in_use {
        let Some(target) = reassign_to else {
            return Err(AppError::Conflict(format!(
                "A categoria \"{}\" está em uso. Escolha outra categoria para reclassificar os registros.",
                cat.name
            )));
        };
        if target == id {
            return validation("Escolha uma categoria de destino diferente.");
        }
        ensure_kind(&tx, target, cat.kind)?;
        tx.execute("UPDATE transactions SET category_id = ?1, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE category_id = ?2", [target, id])?;
        tx.execute("UPDATE recurring_expenses SET category_id = ?1 WHERE category_id = ?2", [target, id])?;
        tx.execute("UPDATE installment_plans SET category_id = ?1 WHERE category_id = ?2", [target, id])?;
    }
    // Orçamentos são somados ao da categoria de destino no mesmo mês (nada é perdido).
    if let Some(target) = reassign_to.filter(|_| in_use) {
        tx.execute(
            "INSERT INTO budgets (category_id, month, limit_cents)
             SELECT ?1, month, limit_cents FROM budgets WHERE category_id = ?2
             ON CONFLICT(category_id, month) DO UPDATE SET limit_cents = limit_cents + excluded.limit_cents",
            [target, id],
        )?;
    }
    tx.execute("DELETE FROM budgets WHERE category_id = ?1", [id])?;
    tx.execute("DELETE FROM categories WHERE id = ?1", [id])?;
    tx.commit()?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::Db;

    fn input(name: &str, kind: Kind) -> CategoryInput {
        CategoryInput { name: name.into(), kind, color: "#22C55E".into(), icon: "tag".into() }
    }

    fn cat_id(c: &Connection, name: &str, kind: Kind) -> i64 {
        c.query_row("SELECT id FROM categories WHERE name = ?1 AND kind = ?2", params![name, kind], |r| r.get(0))
            .unwrap()
    }

    #[test]
    fn create_rejects_duplicates_case_insensitive() {
        let db = Db::open_in_memory().unwrap();
        db.with(|c| {
            create(c, input("Pets", Kind::Expense))?;
            assert!(matches!(create(c, input("pets", Kind::Expense)), Err(AppError::Conflict(_))));
            // mesmo nome em outro tipo é permitido
            create(c, input("Pets", Kind::Income))?;
            Ok(())
        })
        .unwrap();
    }

    #[test]
    fn delete_in_use_requires_reassignment_and_moves_everything() {
        let db = Db::open_in_memory().unwrap();
        db.with(|c| {
            let food = cat_id(c, "Alimentação", Kind::Expense);
            let other = cat_id(c, "Outros", Kind::Expense);
            c.execute("INSERT INTO transactions (description, amount_cents, kind, category_id, date) VALUES ('Mercado', 5000, 'expense', ?1, '2026-01-10')", [food])?;
            c.execute("INSERT INTO budgets (category_id, month, limit_cents) VALUES (?1, '2026-01', 10000)", [food])?;
            c.execute("INSERT INTO budgets (category_id, month, limit_cents) VALUES (?1, '2026-01', 2000)", [other])?;

            assert!(matches!(delete(c, food, None), Err(AppError::Conflict(_))));
            let income = cat_id(c, "Salário", Kind::Income);
            assert!(delete(c, food, Some(income)).is_err(), "destino de outro tipo deve falhar");

            delete(c, food, Some(other))?;
            let moved: i64 = c.query_row("SELECT COUNT(*) FROM transactions WHERE category_id = ?1", [other], |r| r.get(0))?;
            assert_eq!(moved, 1);
            let budget: i64 = c.query_row("SELECT limit_cents FROM budgets WHERE category_id = ?1", [other], |r| r.get(0))?;
            assert_eq!(budget, 12000);
            Ok(())
        })
        .unwrap();
    }

    #[test]
    fn unused_category_is_deleted_directly() {
        let db = Db::open_in_memory().unwrap();
        db.with(|c| {
            let id = create(c, input("Temporária", Kind::Expense))?.id;
            delete(c, id, None)?;
            assert!(get(c, id).is_err());
            Ok(())
        })
        .unwrap();
    }
}
