mod commands;
mod db;
mod error;
mod fmt;
mod models;
mod period;
mod services;

use tauri::Manager;

/// Nome do arquivo do banco dentro de `%LOCALAPPDATA%\com.wckd.app\`.
const DATABASE_FILE: &str = "wckd.db";

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            // Dados ficam fora da pasta de instalação: atualizações nunca tocam no banco.
            let dir = app.path().app_local_data_dir()?;
            let database = db::Db::open(&dir.join(DATABASE_FILE))
                .map_err(|e| Box::<dyn std::error::Error>::from(e.to_string()))?;
            // Fundo da janela conforme o tema salvo, para não "piscar" branco no tema escuro.
            let dark = database
                .with(|c| services::settings::load(c))
                .map(|s| s.theme == "dark")
                .unwrap_or(false);
            if let Some(win) = app.get_webview_window("main") {
                let color = if dark { tauri::window::Color(18, 18, 18, 255) } else { tauri::window::Color(255, 255, 255, 255) };
                let _ = win.set_background_color(Some(color));
            }
            app.manage(database);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_app_info,
            commands::open_data_folder,
            commands::get_settings,
            commands::save_settings,
            commands::list_categories,
            commands::create_category,
            commands::update_category,
            commands::delete_category,
            commands::list_transactions,
            commands::create_transaction,
            commands::update_transaction,
            commands::delete_transaction,
            commands::get_dashboard,
            commands::get_analytics,
            commands::get_history,
            commands::get_recurring_overview,
            commands::create_recurring,
            commands::update_recurring,
            commands::delete_recurring,
            commands::pay_recurring,
            commands::recurring_history,
            commands::list_installments,
            commands::create_installment,
            commands::update_installment,
            commands::delete_installment,
            commands::installment_parcels,
            commands::get_budgets,
            commands::set_budget,
            commands::remove_budget,
            commands::copy_budgets,
            commands::export_backup,
            commands::pick_backup,
            commands::restore_backup,
            commands::export_transactions_csv,
            commands::export_monthly_summary_csv,
            commands::export_category_report_csv,
        ])
        .run(tauri::generate_context!())
        .expect("erro ao iniciar o WCKD");
}
