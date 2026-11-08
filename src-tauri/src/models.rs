//! Tipos compartilhados com o frontend (espelhados em `src/types/index.ts`).

use rusqlite::types::{FromSql, FromSqlError, FromSqlResult, ToSql, ToSqlOutput, ValueRef};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Kind {
    Income,
    Expense,
}

impl Kind {
    pub fn as_str(self) -> &'static str {
        match self {
            Kind::Income => "income",
            Kind::Expense => "expense",
        }
    }
    pub fn label(self) -> &'static str {
        match self {
            Kind::Income => "Receita",
            Kind::Expense => "Despesa",
        }
    }
}

impl ToSql for Kind {
    fn to_sql(&self) -> rusqlite::Result<ToSqlOutput<'_>> {
        Ok(self.as_str().into())
    }
}

impl FromSql for Kind {
    fn column_result(value: ValueRef<'_>) -> FromSqlResult<Self> {
        match value.as_str()? {
            "income" => Ok(Kind::Income),
            "expense" => Ok(Kind::Expense),
            _ => Err(FromSqlError::InvalidType),
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Category {
    pub id: i64,
    pub name: String,
    pub kind: Kind,
    pub color: String,
    pub icon: String,
    /// Quantidade de transações vinculadas.
    pub transaction_count: i64,
    /// Contas recorrentes + parcelamentos vinculados.
    pub link_count: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Transaction {
    pub id: i64,
    pub description: String,
    pub amount_cents: i64,
    pub kind: Kind,
    pub category_id: i64,
    pub category_name: String,
    pub category_color: String,
    pub category_icon: String,
    pub date: String,
    pub notes: Option<String>,
    pub recurring_id: Option<i64>,
    pub installment_plan_id: Option<i64>,
    pub installment_number: Option<i64>,
    pub installment_count: Option<i64>,
    pub created_at: String,
    pub updated_at: String,
}

/// Total por categoria em um período.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CategoryTotal {
    pub category_id: i64,
    pub name: String,
    pub color: String,
    pub icon: String,
    pub total_cents: i64,
    /// Participação (0–100) sobre o total do tipo no período.
    pub share: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MonthPoint {
    pub month: String,
    pub income_cents: i64,
    pub expense_cents: i64,
    pub result_cents: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BalancePoint {
    pub month: String,
    /// `None` quando o mês termina antes da data de referência do saldo inicial.
    pub balance_cents: Option<i64>,
}
