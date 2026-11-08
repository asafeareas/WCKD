// Wrappers tipados para as commands do Tauri. Toda a lógica financeira vive no Rust.
import { invoke } from "@tauri-apps/api/core";
import type * as T from "../types";

export const api = {
  appInfo: () => invoke<T.AppInfo>("get_app_info"),
  openDataFolder: () => invoke<void>("open_data_folder"),

  getSettings: () => invoke<T.Settings>("get_settings"),
  saveSettings: (input: T.Settings) => invoke<T.Settings>("save_settings", { input }),

  listCategories: () => invoke<T.Category[]>("list_categories"),
  createCategory: (input: T.CategoryInput) => invoke<T.Category>("create_category", { input }),
  updateCategory: (id: number, input: T.CategoryInput) => invoke<T.Category>("update_category", { id, input }),
  deleteCategory: (id: number, reassignTo: number | null) => invoke<void>("delete_category", { id, reassignTo }),

  listTransactions: (filter: T.TransactionFilter) => invoke<T.TransactionPage>("list_transactions", { filter }),
  createTransaction: (input: T.TransactionInput) => invoke<T.Transaction>("create_transaction", { input }),
  updateTransaction: (id: number, input: T.TransactionInput) =>
    invoke<T.Transaction>("update_transaction", { id, input }),
  deleteTransaction: (id: number) => invoke<void>("delete_transaction", { id }),

  dashboard: (period: T.PeriodInput) => invoke<T.Dashboard>("get_dashboard", { period }),
  analytics: (month: string) => invoke<T.Analytics>("get_analytics", { month }),
  history: (month: string, span: number) => invoke<T.History>("get_history", { month, span }),

  recurringOverview: (month: string) => invoke<T.RecurringOverview>("get_recurring_overview", { month }),
  createRecurring: (input: T.RecurringInput) => invoke<T.Recurring>("create_recurring", { input }),
  updateRecurring: (id: number, input: T.RecurringInput) => invoke<T.Recurring>("update_recurring", { id, input }),
  deleteRecurring: (id: number) => invoke<void>("delete_recurring", { id }),
  payRecurring: (input: T.PayInput) => invoke<T.Transaction>("pay_recurring", { input }),
  recurringHistory: (id: number) => invoke<T.Transaction[]>("recurring_history", { id }),

  listInstallments: () => invoke<T.InstallmentPlan[]>("list_installments"),
  createInstallment: (input: T.InstallmentInput) => invoke<T.InstallmentPlan>("create_installment", { input }),
  updateInstallment: (id: number, input: T.InstallmentInput) =>
    invoke<T.InstallmentPlan>("update_installment", { id, input }),
  deleteInstallment: (id: number) => invoke<void>("delete_installment", { id }),
  installmentParcels: (id: number) => invoke<T.Transaction[]>("installment_parcels", { id }),

  budgets: (month: string) => invoke<T.BudgetOverview>("get_budgets", { month }),
  setBudget: (categoryId: number, month: string, limitCents: number) =>
    invoke<void>("set_budget", { input: { categoryId, month, limitCents } }),
  removeBudget: (categoryId: number, month: string) => invoke<void>("remove_budget", { categoryId, month }),
  copyBudgets: (month: string) => invoke<number>("copy_budgets", { month }),

  exportBackup: () => invoke<string | null>("export_backup"),
  pickBackup: () => invoke<T.BackupInfo | null>("pick_backup"),
  restoreBackup: (path: string) => invoke<string>("restore_backup", { path }),
  exportTransactionsCsv: (filter: T.TransactionFilter) => invoke<string | null>("export_transactions_csv", { filter }),
  exportMonthlySummaryCsv: (year: number) => invoke<string | null>("export_monthly_summary_csv", { year }),
  exportCategoryReportCsv: (year: number) => invoke<string | null>("export_category_report_csv", { year }),
};

export function errorMessage(e: unknown): string {
  if (e && typeof e === "object" && "message" in e) return String((e as T.AppError).message);
  if (typeof e === "string") return e;
  return "Ocorreu um erro inesperado.";
}
