import type { Kind, SortOrder, TransactionFilter } from "../types";
import { lastDayOfMonth, monthKey } from "./format";

export type RangePreset = "month" | "year" | "all" | "custom";

export interface FilterState {
  search: string;
  kind: Kind | "all";
  categoryId: number | null;
  range: RangePreset;
  year: number;
  month: number;
  customStart: string;
  customEnd: string;
  sort: SortOrder;
}

/** Converte o estado da tela de transações no filtro enviado ao backend. */
export function buildFilter(s: FilterState, limit?: number): TransactionFilter {
  const f: TransactionFilter = { sort: s.sort };
  if (limit) f.limit = limit;
  const search = s.search.trim();
  if (search) f.search = search;
  if (s.kind !== "all") f.kind = s.kind;
  if (s.categoryId != null) f.categoryId = s.categoryId;
  if (s.range === "month") {
    f.startDate = `${monthKey(s.year, s.month)}-01`;
    f.endDate = `${monthKey(s.year, s.month)}-${lastDayOfMonth(s.year, s.month)}`;
  } else if (s.range === "year") {
    f.startDate = `${s.year}-01-01`;
    f.endDate = `${s.year}-12-31`;
  } else if (s.range === "custom") {
    if (s.customStart) f.startDate = s.customStart;
    if (s.customEnd) f.endDate = s.customEnd;
  }
  return f;
}
