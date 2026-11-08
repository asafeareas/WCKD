// Contratos espelhados dos structs Rust (src-tauri/src). Valores monetários sempre em centavos.

export type Kind = "income" | "expense";

export interface AppError {
  kind: "validation" | "not_found" | "conflict" | "database" | "io" | "internal";
  message: string;
}

export interface AppInfo {
  version: string;
  databasePath: string;
  dataDir: string;
  schemaVersion: number;
}

export interface Settings {
  initialBalanceCents: number;
  initialBalanceDate: string | null;
  hideValues: boolean;
  theme: Theme;
}

export type Theme = "light" | "dark";

export interface Category {
  id: number;
  name: string;
  kind: Kind;
  color: string;
  icon: string;
  transactionCount: number;
  linkCount: number;
}

export interface CategoryInput {
  name: string;
  kind: Kind;
  color: string;
  icon: string;
}

export interface Transaction {
  id: number;
  description: string;
  amountCents: number;
  kind: Kind;
  categoryId: number;
  categoryName: string;
  categoryColor: string;
  categoryIcon: string;
  date: string;
  notes: string | null;
  recurringId: number | null;
  installmentPlanId: number | null;
  installmentNumber: number | null;
  installmentCount: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface TransactionInput {
  description: string;
  amountCents: number;
  kind: Kind;
  categoryId: number;
  date: string;
  notes: string | null;
}

export type SortOrder = "date_desc" | "date_asc" | "amount_desc" | "amount_asc";

export interface TransactionFilter {
  search?: string;
  kind?: Kind;
  categoryId?: number;
  startDate?: string;
  endDate?: string;
  sort?: SortOrder;
  limit?: number;
  offset?: number;
}

export interface TransactionPage {
  items: Transaction[];
  totalCount: number;
  incomeCents: number;
  expenseCents: number;
}

export type PeriodInput = { kind: "month"; year: number; month: number } | { kind: "year"; year: number };

export interface CategoryTotal {
  categoryId: number;
  name: string;
  color: string;
  icon: string;
  totalCents: number;
  share: number;
}

export interface MonthPoint {
  month: string;
  incomeCents: number;
  expenseCents: number;
  resultCents: number;
}

export interface BalancePoint {
  month: string;
  balanceCents: number | null;
}

export type BalanceMode = "current" | "past" | "projected";

export interface Dashboard {
  today: string;
  currentBalanceCents: number;
  periodBalanceCents: number | null;
  balanceMode: BalanceMode;
  incomeCents: number;
  expenseCents: number;
  resultCents: number;
  savingsRate: number | null;
  expenseByCategory: CategoryTotal[];
  monthly: MonthPoint[];
  balanceEvolution: BalancePoint[];
  recent: Transaction[];
  hasTransactions: boolean;
}

export type Tone = "positive" | "negative" | "neutral";

export interface Insight {
  id: string;
  tone: Tone;
  message: string;
}

export interface ExpenseRef {
  id: number;
  description: string;
  amountCents: number;
  date: string;
  categoryName: string;
}

export interface CategoryGrowth {
  categoryId: number;
  name: string;
  color: string;
  previousCents: number;
  currentCents: number;
  changePct: number;
}

export interface RecurringCandidate {
  description: string;
  categoryName: string;
  months: number;
  averageCents: number;
}

export interface IncomeShare {
  categoryId: number;
  name: string;
  color: string;
  totalCents: number;
  shareOfIncome: number;
}

export interface Analytics {
  month: string;
  incomeCents: number;
  expenseCents: number;
  hasMonthData: boolean;
  previousExpenseCents: number | null;
  expenseChangeCents: number | null;
  expenseChangePct: number | null;
  averageExpenseCents: number | null;
  monthsWithData: number;
  largestExpense: ExpenseRef | null;
  smallestExpense: ExpenseRef | null;
  incomeCommittedPct: number | null;
  savingsRate: number | null;
  topCategory: CategoryTotal | null;
  fastestGrowing: CategoryGrowth | null;
  incomeConsumers: IncomeShare[];
  recurringCandidates: RecurringCandidate[];
  registeredRecurringMonthlyCents: number;
  balanceStartCents: number | null;
  balanceEndCents: number | null;
  insights: Insight[];
  needsMoreData: string[];
}

export interface History {
  months: MonthPoint[];
  monthsWithData: number;
  totalIncomeCents: number;
  totalExpenseCents: number;
  averageIncomeCents: number | null;
  averageExpenseCents: number | null;
  averageResultCents: number | null;
  categories: CategoryTotal[];
}

export type Frequency = "weekly" | "monthly" | "yearly";

export interface Recurring {
  id: number;
  name: string;
  amountCents: number;
  categoryId: number;
  categoryName: string;
  categoryColor: string;
  categoryIcon: string;
  frequency: Frequency;
  startDate: string;
  endDate: string | null;
  notes: string | null;
  active: boolean;
  monthlyEquivalentCents: number;
  paymentCount: number;
  nextDueDate: string | null;
}

export interface RecurringInput {
  name: string;
  amountCents: number;
  categoryId: number;
  frequency: Frequency;
  startDate: string;
  endDate: string | null;
  notes: string | null;
  active: boolean;
}

export type OccurrenceStatus = "paid" | "pending" | "overdue";

export interface Occurrence {
  recurringId: number;
  name: string;
  categoryName: string;
  categoryColor: string;
  categoryIcon: string;
  dueDate: string;
  expectedCents: number;
  status: OccurrenceStatus;
  transactionId: number | null;
  paidCents: number | null;
  paidDate: string | null;
}

export interface RecurringOverview {
  month: string;
  items: Recurring[];
  monthOccurrences: Occurrence[];
  upcoming: Occurrence[];
  overdue: Occurrence[];
  monthlyTotalCents: number;
  monthExpectedCents: number;
  monthPaidCents: number;
  monthPendingCents: number;
}

export interface PayInput {
  recurringId: number;
  dueDate: string;
  paidDate: string;
  amountCents: number;
}

export interface InstallmentPlan {
  id: number;
  description: string;
  totalCents: number;
  installmentCount: number;
  installmentCents: number;
  firstInstallmentCents: number;
  firstDate: string;
  lastDate: string;
  categoryId: number;
  categoryName: string;
  categoryColor: string;
  categoryIcon: string;
  notes: string | null;
  paidCount: number;
  paidCents: number;
  remainingCents: number;
  next: { number: number; date: string; amountCents: number } | null;
}

export interface InstallmentInput {
  description: string;
  totalCents: number;
  installmentCount: number;
  firstDate: string;
  categoryId: number;
  notes: string | null;
}

export type BudgetStatus = "ok" | "warning" | "over";

export interface BudgetLine {
  categoryId: number;
  name: string;
  color: string;
  icon: string;
  limitCents: number;
  spentCents: number;
  remainingCents: number;
  usedPct: number;
  status: BudgetStatus;
}

export interface BudgetOverview {
  month: string;
  lines: BudgetLine[];
  totalLimitCents: number;
  totalSpentCents: number;
  unbudgetedSpentCents: number;
  previousMonthHasBudgets: boolean;
}

export interface BackupInfo {
  path: string;
  schemaVersion: number;
  fileSizeBytes: number;
  transactionCount: number;
  categoryCount: number;
  firstDate: string | null;
  lastDate: string | null;
}
