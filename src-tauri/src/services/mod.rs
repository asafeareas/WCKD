//! Regras de negócio. Cada módulo recebe uma `&Connection` e não conhece o Tauri,
//! o que permite testá-los com SQLite em memória.

pub mod analytics;
pub mod backup;
pub mod budgets;
pub mod categories;
pub mod dashboard;
pub mod export;
pub mod installments;
pub mod recurring;
pub mod settings;
pub mod transactions;
