//! Commands do Tauri: camada fina que valida a entrada, chama os serviços e devolve DTOs.
//! Todas são `async` para rodar fora da thread principal e nunca travar a interface.

use std::path::PathBuf;

use serde::Serialize;
use tauri::{AppHandle, Manager, State};
use tauri_plugin_dialog::DialogExt;

use crate::db::{Db, SCHEMA_VERSION};
use crate::error::{AppError, AppResult};
use crate::models::{Category, Transaction};
use crate::period::{today, Month};
use crate::services::{
    analytics, backup, budgets, categories, dashboard, export, installments, recurring, settings, transactions,
};

type Cmd<T> = Result<T, AppError>;

// ---------- Aplicativo ----------

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppInfo {
    version: String,
    database_path: String,
    data_dir: String,
    schema_version: i64,
}

#[tauri::command]
pub async fn get_app_info(app: AppHandle, db: State<'_, Db>) -> Cmd<AppInfo> {
    Ok(AppInfo {
        version: app.package_info().version.to_string(),
        database_path: db.path.to_string_lossy().into_owned(),
        data_dir: db.path.parent().map(|p| p.to_string_lossy().into_owned()).unwrap_or_default(),
        schema_version: SCHEMA_VERSION,
    })
}

#[tauri::command]
pub async fn open_data_folder(db: State<'_, Db>) -> Cmd<()> {
    let dir = db.path.parent().ok_or_else(|| AppError::Internal("Pasta de dados não encontrada.".into()))?;
    std::process::Command::new("explorer").arg(dir).spawn()?;
    Ok(())
}

// ---------- Configurações ----------

#[tauri::command]
pub async fn get_settings(db: State<'_, Db>) -> Cmd<settings::Settings> {
    db.with(|c| settings::load(c))
}

#[tauri::command]
pub async fn save_settings(db: State<'_, Db>, input: settings::Settings) -> Cmd<settings::Settings> {
    db.with(|c| settings::save(c, input))
}

// ---------- Categorias ----------

#[tauri::command]
pub async fn list_categories(db: State<'_, Db>) -> Cmd<Vec<Category>> {
    db.with(|c| categories::list(c))
}

#[tauri::command]
pub async fn create_category(db: State<'_, Db>, input: categories::CategoryInput) -> Cmd<Category> {
    db.with(|c| categories::create(c, input))
}

#[tauri::command]
pub async fn update_category(db: State<'_, Db>, id: i64, input: categories::CategoryInput) -> Cmd<Category> {
    db.with(|c| categories::update(c, id, input))
}

#[tauri::command]
pub async fn delete_category(db: State<'_, Db>, id: i64, reassign_to: Option<i64>) -> Cmd<()> {
    db.with(|c| categories::delete(c, id, reassign_to))
}

// ---------- Transações ----------

#[tauri::command]
pub async fn list_transactions(db: State<'_, Db>, filter: transactions::TransactionFilter) -> Cmd<transactions::TransactionPage> {
    db.with(|c| transactions::list(c, filter))
}

#[tauri::command]
pub async fn create_transaction(db: State<'_, Db>, input: transactions::TransactionInput) -> Cmd<Transaction> {
    db.with(|c| transactions::create(c, input))
}

#[tauri::command]
pub async fn update_transaction(db: State<'_, Db>, id: i64, input: transactions::TransactionInput) -> Cmd<Transaction> {
    db.with(|c| transactions::update(c, id, input))
}

#[tauri::command]
pub async fn delete_transaction(db: State<'_, Db>, id: i64) -> Cmd<()> {
    db.with(|c| transactions::delete(c, id))
}

// ---------- Dashboard e análises ----------

#[tauri::command]
pub async fn get_dashboard(db: State<'_, Db>, period: dashboard::PeriodInput) -> Cmd<dashboard::Dashboard> {
    db.with(|c| dashboard::get(c, period, today()))
}

#[tauri::command]
pub async fn get_analytics(db: State<'_, Db>, month: String) -> Cmd<analytics::Analytics> {
    let m = Month::parse(&month)?;
    db.with(|c| analytics::get(c, m))
}

#[tauri::command]
pub async fn get_history(db: State<'_, Db>, month: String, span: u32) -> Cmd<analytics::History> {
    let m = Month::parse(&month)?;
    db.with(|c| analytics::history(c, m, span))
}

// ---------- Contas recorrentes ----------

#[tauri::command]
pub async fn get_recurring_overview(db: State<'_, Db>, month: String) -> Cmd<recurring::RecurringOverview> {
    let m = Month::parse(&month)?;
    db.with(|c| recurring::overview(c, m, today()))
}

#[tauri::command]
pub async fn create_recurring(db: State<'_, Db>, input: recurring::RecurringInput) -> Cmd<recurring::Recurring> {
    db.with(|c| recurring::create(c, input))
}

#[tauri::command]
pub async fn update_recurring(db: State<'_, Db>, id: i64, input: recurring::RecurringInput) -> Cmd<recurring::Recurring> {
    db.with(|c| recurring::update(c, id, input))
}

#[tauri::command]
pub async fn delete_recurring(db: State<'_, Db>, id: i64) -> Cmd<()> {
    db.with(|c| recurring::delete(c, id))
}

#[tauri::command]
pub async fn pay_recurring(db: State<'_, Db>, input: recurring::PayInput) -> Cmd<Transaction> {
    db.with(|c| recurring::pay(c, input))
}

#[tauri::command]
pub async fn recurring_history(db: State<'_, Db>, id: i64) -> Cmd<Vec<Transaction>> {
    db.with(|c| recurring::history(c, id))
}

// ---------- Parcelamentos ----------

#[tauri::command]
pub async fn list_installments(db: State<'_, Db>) -> Cmd<Vec<installments::InstallmentPlan>> {
    db.with(|c| installments::list(c, today()))
}

#[tauri::command]
pub async fn create_installment(db: State<'_, Db>, input: installments::InstallmentInput) -> Cmd<installments::InstallmentPlan> {
    db.with(|c| installments::create(c, input, today()))
}

#[tauri::command]
pub async fn update_installment(
    db: State<'_, Db>,
    id: i64,
    input: installments::InstallmentInput,
) -> Cmd<installments::InstallmentPlan> {
    db.with(|c| installments::update(c, id, input, today()))
}

#[tauri::command]
pub async fn delete_installment(db: State<'_, Db>, id: i64) -> Cmd<()> {
    db.with(|c| installments::delete(c, id))
}

#[tauri::command]
pub async fn installment_parcels(db: State<'_, Db>, id: i64) -> Cmd<Vec<Transaction>> {
    db.with(|c| installments::parcels(c, id))
}

// ---------- Orçamentos ----------

#[tauri::command]
pub async fn get_budgets(db: State<'_, Db>, month: String) -> Cmd<budgets::BudgetOverview> {
    let m = Month::parse(&month)?;
    db.with(|c| budgets::overview(c, m))
}

#[tauri::command]
pub async fn set_budget(db: State<'_, Db>, input: budgets::BudgetInput) -> Cmd<()> {
    db.with(|c| budgets::set(c, input))
}

#[tauri::command]
pub async fn remove_budget(db: State<'_, Db>, category_id: i64, month: String) -> Cmd<()> {
    db.with(|c| budgets::remove(c, category_id, &month))
}

#[tauri::command]
pub async fn copy_budgets(db: State<'_, Db>, month: String) -> Cmd<usize> {
    db.with(|c| budgets::copy_previous(c, &month))
}

// ---------- Backup e exportação ----------

fn pick_save(app: &AppHandle, title: &str, default_name: &str, filter_name: &str, ext: &str) -> AppResult<Option<PathBuf>> {
    let picked = app
        .dialog()
        .file()
        .set_title(title)
        .set_file_name(default_name)
        .add_filter(filter_name, &[ext])
        .blocking_save_file();
    match picked {
        None => Ok(None),
        Some(p) => {
            let mut path = p.into_path().map_err(|_| AppError::Internal("Caminho de arquivo inválido.".into()))?;
            if path.extension().is_none_or(|e| !e.eq_ignore_ascii_case(ext)) {
                path.set_extension(ext);
            }
            Ok(Some(path))
        }
    }
}

fn stamp() -> String {
    chrono::Local::now().format("%Y-%m-%d").to_string()
}

#[tauri::command]
pub async fn export_backup(app: AppHandle, db: State<'_, Db>) -> Cmd<Option<String>> {
    let Some(path) = pick_save(&app, "Salvar backup do WCKD", &format!("wckd-backup-{}.wckd", stamp()), "Backup WCKD", "wckd")? else {
        return Ok(None);
    };
    db.with(|c| backup::export(c, &path))?;
    Ok(Some(path.to_string_lossy().into_owned()))
}

/// Abre o seletor de arquivo e valida o backup escolhido (sem restaurar).
#[tauri::command]
pub async fn pick_backup(app: AppHandle) -> Cmd<Option<backup::BackupInfo>> {
    let picked = app
        .dialog()
        .file()
        .set_title("Escolher backup para restaurar")
        .add_filter("Backup WCKD", &["wckd", "db", "sqlite"])
        .blocking_pick_file();
    match picked {
        None => Ok(None),
        Some(p) => {
            let path = p.into_path().map_err(|_| AppError::Internal("Caminho de arquivo inválido.".into()))?;
            Ok(Some(backup::inspect(&path)?))
        }
    }
}

/// Restaura o backup. Retorna o caminho da cópia de segurança do banco anterior.
#[tauri::command]
pub async fn restore_backup(app: AppHandle, db: State<'_, Db>, path: String) -> Cmd<String> {
    let safety_dir = app
        .path()
        .app_local_data_dir()
        .map_err(|_| AppError::Internal("Pasta de dados não encontrada.".into()))?
        .join("backups");
    let safety = db.with(|c| backup::restore(c, &PathBuf::from(path), &safety_dir))?;
    Ok(safety.to_string_lossy().into_owned())
}

#[tauri::command]
pub async fn export_transactions_csv(
    app: AppHandle,
    db: State<'_, Db>,
    filter: transactions::TransactionFilter,
) -> Cmd<Option<String>> {
    let Some(path) = pick_save(&app, "Exportar transações", &format!("wckd-transacoes-{}.csv", stamp()), "CSV", "csv")? else {
        return Ok(None);
    };
    let csv = db.with(|c| export::transactions_csv(c, filter))?;
    export::save(&path, csv)?;
    Ok(Some(path.to_string_lossy().into_owned()))
}

#[tauri::command]
pub async fn export_monthly_summary_csv(app: AppHandle, db: State<'_, Db>, year: i32) -> Cmd<Option<String>> {
    let Some(path) = pick_save(&app, "Exportar resumo mensal", &format!("wckd-resumo-mensal-{year}.csv"), "CSV", "csv")? else {
        return Ok(None);
    };
    let csv = db.with(|c| export::monthly_summary_csv(c, year))?;
    export::save(&path, csv)?;
    Ok(Some(path.to_string_lossy().into_owned()))
}

#[tauri::command]
pub async fn export_category_report_csv(app: AppHandle, db: State<'_, Db>, year: i32) -> Cmd<Option<String>> {
    let Some(path) = pick_save(&app, "Exportar relatório por categoria", &format!("wckd-categorias-{year}.csv"), "CSV", "csv")? else {
        return Ok(None);
    };
    let csv = db.with(|c| export::category_report_csv(c, year))?;
    export::save(&path, csv)?;
    Ok(Some(path.to_string_lossy().into_owned()))
}
