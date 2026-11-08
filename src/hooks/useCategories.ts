import { useMemo } from "react";
import { api } from "../lib/api";
import { useQuery } from "../lib/store";
import type { Category, Kind } from "../types";

export function useCategories() {
  const q = useQuery(api.listCategories, []);
  const byKind = useMemo(() => {
    const all = q.data ?? [];
    return {
      income: all.filter((c) => c.kind === "income"),
      expense: all.filter((c) => c.kind === "expense"),
    } as Record<Kind, Category[]>;
  }, [q.data]);
  return { ...q, categories: q.data ?? [], byKind };
}
