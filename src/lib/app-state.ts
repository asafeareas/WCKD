// Estado de navegação compartilhado: página atual, período selecionado e modal de lançamento.
import { useSyncExternalStore } from "react";
import type { Kind, PeriodInput, Transaction } from "../types";
import { monthKey } from "./format";

type Listener = () => void;

function store<T>(initial: T) {
  let value = initial;
  const ls = new Set<Listener>();
  const api = {
    get: () => value,
    set: (v: T) => {
      value = v;
      ls.forEach((l) => l());
    },
    subscribe: (l: Listener) => {
      ls.add(l);
      return () => ls.delete(l);
    },
    use: () => useSyncExternalStore(api.subscribe, api.get),
  };
  return api;
}

export type Page =
  | "dashboard"
  | "transactions"
  | "analytics"
  | "budgets"
  | "recurring"
  | "installments"
  | "categories"
  | "settings";

export const pageStore = store<Page>("dashboard");
export const navigate = (p: Page) => pageStore.set(p);

export interface Period {
  mode: "month" | "year";
  year: number;
  month: number; // 1–12; em modo anual, lembra o mês para voltar
}

const now = new Date();
export const periodStore = store<Period>({ mode: "month", year: now.getFullYear(), month: now.getMonth() + 1 });

export function periodInput(p: Period): PeriodInput {
  return p.mode === "year" ? { kind: "year", year: p.year } : { kind: "month", year: p.year, month: p.month };
}

export function periodMonthKey(p: Period): string {
  return monthKey(p.year, p.month);
}

export function shiftPeriod(p: Period, delta: number): Period {
  if (p.mode === "year") return { ...p, year: p.year + delta };
  const idx = p.year * 12 + (p.month - 1) + delta;
  return { ...p, year: Math.floor(idx / 12), month: (idx % 12) + 1 };
}

export function isCurrentPeriod(p: Period): boolean {
  const d = new Date();
  return p.year === d.getFullYear() && (p.mode === "year" || p.month === d.getMonth() + 1);
}

export function resetPeriod(mode: Period["mode"] = periodStore.get().mode) {
  const d = new Date();
  periodStore.set({ mode, year: d.getFullYear(), month: d.getMonth() + 1 });
}

// Modal de lançamento rápido (Ctrl+N em qualquer tela)
export interface TxModalState {
  open: boolean;
  editing: Transaction | null;
  kind: Kind;
}
export const txModalStore = store<TxModalState>({ open: false, editing: null, kind: "expense" });
export const openNewTransaction = (kind: Kind = "expense") => txModalStore.set({ open: true, editing: null, kind });
export const openEditTransaction = (t: Transaction) => txModalStore.set({ open: true, editing: t, kind: t.kind });
export const closeTransactionModal = () => txModalStore.set({ ...txModalStore.get(), open: false });
