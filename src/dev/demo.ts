// MODO DEMONSTRAÇÃO — apenas para gerar os prints do README no navegador (`npm run dev` + `?demo`).
// Só é carregado em desenvolvimento (import.meta.env.DEV) e nunca entra no executável.
// Simula as commands do Tauri com dados fictícios isolados aqui.
import { navigate, type Page } from "../lib/app-state";
import { applyTheme } from "../lib/store";

type Cat = { id: number; name: string; kind: "income" | "expense"; color: string; icon: string; transactionCount: number; linkCount: number };

const cats: Cat[] = [
  { id: 1, name: "Alimentação", kind: "expense", color: "#FF8040", icon: "utensils", transactionCount: 14, linkCount: 0 },
  { id: 2, name: "Transporte", kind: "expense", color: "#0000FF", icon: "car", transactionCount: 9, linkCount: 0 },
  { id: 3, name: "Moradia", kind: "expense", color: "#800080", icon: "home", transactionCount: 6, linkCount: 1 },
  { id: 4, name: "Lazer", kind: "expense", color: "#FF00FF", icon: "gamepad", transactionCount: 7, linkCount: 0 },
  { id: 5, name: "Tecnologia", kind: "expense", color: "#8000FF", icon: "laptop", transactionCount: 3, linkCount: 1 },
  { id: 6, name: "Assinaturas", kind: "expense", color: "#0080FF", icon: "repeat", transactionCount: 6, linkCount: 2 },
  { id: 7, name: "Saúde", kind: "expense", color: "#FF0080", icon: "heart-pulse", transactionCount: 2, linkCount: 0 },
  { id: 13, name: "Salário", kind: "income", color: "#00C800", icon: "briefcase", transactionCount: 6, linkCount: 0 },
  { id: 14, name: "Freelance", kind: "income", color: "#008000", icon: "pen-tool", transactionCount: 3, linkCount: 0 },
];

const cat = (id: number) => cats.find((c) => c.id === id)!;
const tx = (id: number, d: string, a: number, k: "income" | "expense", c: number, dt: string, extra = {}) => ({
  id, description: d, amountCents: a, kind: k, categoryId: c, categoryName: cat(c).name, categoryColor: cat(c).color,
  categoryIcon: cat(c).icon, date: dt, notes: null, recurringId: null, installmentPlanId: null, installmentNumber: null,
  installmentCount: null, createdAt: "", updatedAt: "", ...extra,
});

const recent = [
  tx(1, "Mercado do mês", 61540, "expense", 1, "2026-11-07"),
  tx(2, "Uber", 2350, "expense", 2, "2026-11-06"),
  tx(3, "Salário", 450000, "income", 13, "2026-11-05"),
  tx(4, "Aluguel", 120000, "expense", 3, "2026-11-05", { recurringId: 1 }),
  tx(5, "Notebook", 50000, "expense", 5, "2026-11-04", { installmentPlanId: 1, installmentNumber: 3, installmentCount: 10 }),
  tx(6, "Cinema", 6000, "expense", 4, "2026-11-03"),
  tx(7, "Netflix", 5590, "expense", 6, "2026-11-02", { recurringId: 2 }),
  tx(8, "Projeto landing page", 120000, "income", 14, "2026-11-01"),
];

const months = ["2026-06", "2026-07", "2026-08", "2026-09", "2026-10", "2026-11"];
const inc = [420000, 430000, 510000, 460000, 450000, 570000];
const exp = [310000, 280000, 390000, 250000, 330000, 265480];
const series = months.map((m, i) => ({ month: m, incomeCents: inc[i], expenseCents: exp[i], resultCents: inc[i] - exp[i] }));
const byCat = [
  { categoryId: 3, name: "Moradia", color: "#800080", icon: "home", totalCents: 120000, share: 45.2 },
  { categoryId: 1, name: "Alimentação", color: "#FF8040", icon: "utensils", totalCents: 61540, share: 23.2 },
  { categoryId: 5, name: "Tecnologia", color: "#8000FF", icon: "laptop", totalCents: 50000, share: 18.8 },
  { categoryId: 4, name: "Lazer", color: "#FF00FF", icon: "gamepad", totalCents: 20000, share: 7.5 },
  { categoryId: 6, name: "Assinaturas", color: "#0080FF", icon: "repeat", totalCents: 13940, share: 5.3 },
];

const dashboard = {
  today: "2026-11-08", currentBalanceCents: 823410, periodBalanceCents: 823410, balanceMode: "current",
  incomeCents: 570000, expenseCents: 265480, resultCents: 304520, savingsRate: 53.4,
  expenseByCategory: byCat, monthly: series,
  balanceEvolution: ["2025-12", "2026-01", "2026-02", "2026-03", "2026-04", "2026-05", ...months].map((m, i) => ({
    month: m, balanceCents: i < 1 ? null : 250000 + i * 52000 + ((i * 37) % 5) * 18000,
  })),
  recent: recent.slice(0, 6), hasTransactions: true,
};

const analytics = {
  month: "2026-11", incomeCents: 570000, expenseCents: 265480, hasMonthData: true,
  previousExpenseCents: 330000, expenseChangeCents: -64520, expenseChangePct: -19.6, averageExpenseCents: 304247,
  monthsWithData: 6, largestExpense: { id: 4, description: "Aluguel", amountCents: 120000, date: "2026-11-05", categoryName: "Moradia" },
  smallestExpense: { id: 2, description: "Uber", amountCents: 2350, date: "2026-11-06", categoryName: "Transporte" },
  incomeCommittedPct: 46.6, savingsRate: 53.4, topCategory: byCat[0],
  fastestGrowing: { categoryId: 1, name: "Alimentação", color: "#FF8040", previousCents: 50000, currentCents: 61540, changePct: 23.1 },
  incomeConsumers: byCat.slice(0, 3).map((c) => ({ categoryId: c.categoryId, name: c.name, color: c.color, totalCents: c.totalCents, shareOfIncome: (c.totalCents / 570000) * 100 })),
  recurringCandidates: [
    { description: "Uber", categoryName: "Transporte", months: 6, averageCents: 9800 },
    { description: "Padaria", categoryName: "Alimentação", months: 5, averageCents: 4200 },
  ],
  registeredRecurringMonthlyCents: 135590, balanceStartCents: 518890, balanceEndCents: 823410,
  insights: [
    { id: "top_category", tone: "neutral", message: "Seu maior gasto em novembro foi com moradia: R$ 1.200,00 (45% das despesas)." },
    { id: "fastest_growing", tone: "negative", message: "Você gastou 23% a mais com alimentação em comparação ao mês anterior (R$ 500,00 → R$ 615,40)." },
    { id: "vs_previous", tone: "positive", message: "Você reduziu suas despesas em R$ 645,20 em comparação ao mês anterior." },
    { id: "savings", tone: "positive", message: "Você conseguiu guardar R$ 3.045,20 em novembro, equivalente a 53% da sua receita." },
    { id: "registered_recurring", tone: "neutral", message: "Suas contas recorrentes somam R$ 1.355,90 por mês, o equivalente a 51% das despesas de novembro." },
  ],
  needsMoreData: [],
};

const budgets = {
  month: "2026-11",
  lines: [
    { categoryId: 1, name: "Alimentação", color: "#FF8040", icon: "utensils", limitCents: 80000, spentCents: 61540, remainingCents: 18460, usedPct: 76.9, status: "ok" },
    { categoryId: 4, name: "Lazer", color: "#FF00FF", icon: "gamepad", limitCents: 22000, spentCents: 20000, remainingCents: 2000, usedPct: 90.9, status: "warning" },
    { categoryId: 5, name: "Tecnologia", color: "#8000FF", icon: "laptop", limitCents: 40000, spentCents: 50000, remainingCents: -10000, usedPct: 125, status: "over" },
    { categoryId: 2, name: "Transporte", color: "#0000FF", icon: "car", limitCents: 25000, spentCents: 2350, remainingCents: 22650, usedPct: 9.4, status: "ok" },
  ],
  totalLimitCents: 167000, totalSpentCents: 133890, unbudgetedSpentCents: 131590, previousMonthHasBudgets: true,
};

function handle(cmd: string, args: Record<string, unknown> | undefined): unknown {
  switch (cmd) {
    case "get_settings":
      return { initialBalanceCents: 300000, initialBalanceDate: "2026-01-01", hideValues: false, theme: document.documentElement.classList.contains("dark") ? "dark" : "light" };
    case "get_app_info":
      return { version: "0.1.0", databasePath: "C:\\Users\\voce\\AppData\\Local\\com.wckd.app\\wckd.db", dataDir: "", schemaVersion: 2 };
    case "list_categories": return cats;
    case "get_dashboard": return dashboard;
    case "list_transactions": return { items: recent, totalCount: recent.length, incomeCents: 570000, expenseCents: 245480 };
    case "get_analytics": return analytics;
    case "get_history": return { months: series, monthsWithData: 6, totalIncomeCents: 2840000, totalExpenseCents: 1825480, averageIncomeCents: 473333, averageExpenseCents: 304247, averageResultCents: 169087, categories: byCat };
    case "get_budgets": return budgets;
    case "save_settings": return (args as { input: unknown }).input;
    default: return null;
  }
}

export function installDemo() {
  const params = new URLSearchParams(location.search);
  (window as unknown as { __TAURI_INTERNALS__: unknown }).__TAURI_INTERNALS__ = {
    transformCallback: () => 0,
    invoke: async (cmd: string, args?: Record<string, unknown>) => handle(cmd, args),
  };
  applyTheme(params.get("theme") === "dark" ? "dark" : "light");
  const page = params.get("page") as Page | null;
  if (page) navigate(page);
}
