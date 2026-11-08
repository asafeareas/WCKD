import { useEffect, useMemo, useState } from "react";
import { Download, FilterX, Plus, Search, SearchX, Inbox } from "lucide-react";
import { api } from "../lib/api";
import { openNewTransaction, periodStore } from "../lib/app-state";
import { buildFilter, type FilterState } from "../lib/filters";
import { MONTHS } from "../lib/format";
import { mutate, toast, useQuery } from "../lib/store";
import { useCategories } from "../hooks/useCategories";
import { useDebounced } from "../hooks/useDebounced";
import { TransactionRow } from "../components/TransactionList";
import { Button, Card, EmptyState, ErrorState, Input, Money, PageHeader, Segmented, Select, Spinner } from "../components/ui";
import type { SortOrder } from "../types";

const PAGE = 100;

export default function Transactions() {
  const period = periodStore.get();
  const initial: FilterState = {
    search: "",
    kind: "all",
    categoryId: null,
    range: "month",
    year: period.year,
    month: period.month,
    customStart: "",
    customEnd: "",
    sort: "date_desc",
  };
  const [s, setS] = useState<FilterState>(initial);
  const [limit, setLimit] = useState(PAGE);
  const set = (patch: Partial<FilterState>) => {
    setS((prev) => ({ ...prev, ...patch }));
    setLimit(PAGE);
  };

  const { categories } = useCategories();
  const visibleCategories = useMemo(
    () => (s.kind === "all" ? categories : categories.filter((c) => c.kind === s.kind)),
    [categories, s.kind],
  );
  // Remove o filtro de categoria se ele não combinar com o tipo escolhido
  useEffect(() => {
    if (s.categoryId != null && categories.length && !visibleCategories.some((c) => c.id === s.categoryId)) {
      set({ categoryId: null });
    }
  }, [visibleCategories, s.categoryId, categories.length]);

  const search = useDebounced(s.search, 180);
  const filter = useMemo(() => buildFilter({ ...s, search }, limit), [s, search, limit]);
  const key = JSON.stringify(filter);
  const { data, error, loading } = useQuery(() => api.listTransactions(filter), [key]);

  const isFiltered = s.search || s.kind !== "all" || s.categoryId != null;

  async function exportCsv() {
    const path = await mutate(() => api.exportTransactionsCsv(buildFilter(s)));
    if (path) toast("Transações exportadas para CSV.");
  }

  const years = useMemo(() => {
    const y = new Date().getFullYear();
    return Array.from({ length: 12 }, (_, i) => y + 1 - i);
  }, []);

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Transações"
        subtitle="Todas as suas receitas e despesas"
        actions={
          <>
            <Button icon={Download} onClick={exportCsv}>
              Exportar CSV
            </Button>
            <Button variant="primary" icon={Plus} onClick={() => openNewTransaction()}>
              Nova movimentação
            </Button>
          </>
        }
      />

      <Card className="mb-3 flex flex-wrap items-center gap-2 px-3 py-3">
        <div className="relative min-w-56 flex-1">
          <Search size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-subtle" />
          <Input
            placeholder="Buscar por descrição ou observação"
            value={s.search}
            onChange={(e) => set({ search: e.target.value })}
            className="pl-9"
            aria-label="Buscar"
          />
        </div>
        <Segmented
          value={s.kind}
          onChange={(kind) => set({ kind })}
          options={[
            { value: "all", label: "Todas" },
            { value: "income", label: "Receitas" },
            { value: "expense", label: "Despesas" },
          ]}
        />
        <Select
          aria-label="Categoria"
          className="w-52"
          value={s.categoryId ?? ""}
          onChange={(e) => set({ categoryId: e.target.value ? Number(e.target.value) : null })}
        >
          <option value="">Todas as categorias</option>
          {visibleCategories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {s.kind === "all" ? (c.kind === "income" ? " (receita)" : " (despesa)") : ""}
            </option>
          ))}
        </Select>
        <Select aria-label="Ordenação" className="w-44" value={s.sort} onChange={(e) => set({ sort: e.target.value as SortOrder })}>
          <option value="date_desc">Mais recentes</option>
          <option value="date_asc">Mais antigas</option>
          <option value="amount_desc">Maior valor</option>
          <option value="amount_asc">Menor valor</option>
        </Select>

        <div className="flex w-full flex-wrap items-center gap-2 border-t border-line pt-2">
          <Select aria-label="Período" className="w-36" value={s.range} onChange={(e) => set({ range: e.target.value as FilterState["range"] })}>
            <option value="month">Mês</option>
            <option value="year">Ano</option>
            <option value="all">Todo o período</option>
            <option value="custom">Personalizado</option>
          </Select>
          {s.range === "month" && (
            <Select aria-label="Mês" className="w-36" value={s.month} onChange={(e) => set({ month: Number(e.target.value) })}>
              {MONTHS.map((m, i) => (
                <option key={m} value={i + 1}>
                  {m}
                </option>
              ))}
            </Select>
          )}
          {(s.range === "month" || s.range === "year") && (
            <Select aria-label="Ano" className="w-28" value={s.year} onChange={(e) => set({ year: Number(e.target.value) })}>
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </Select>
          )}
          {s.range === "custom" && (
            <>
              <Input type="date" aria-label="Data inicial" className="w-40" value={s.customStart} onChange={(e) => set({ customStart: e.target.value })} />
              <span className="text-xs text-subtle">até</span>
              <Input type="date" aria-label="Data final" className="w-40" value={s.customEnd} onChange={(e) => set({ customEnd: e.target.value })} />
            </>
          )}
          {isFiltered && (
            <Button size="sm" variant="ghost" icon={FilterX} onClick={() => set({ search: "", kind: "all", categoryId: null })}>
              Limpar filtros
            </Button>
          )}
          {data && (
            <div className="ml-auto flex items-center gap-4 text-xs text-subtle">
              <span>
                {data.totalCount} {data.totalCount === 1 ? "movimentação" : "movimentações"}
              </span>
              <span>
                Receitas <Money cents={data.incomeCents} tone="income" className="font-bold" />
              </span>
              <span>
                Despesas <Money cents={data.expenseCents} tone="expense" className="font-bold" />
              </span>
            </div>
          )}
        </div>
      </Card>

      {error && <ErrorState message={error} />}
      <Card className="overflow-hidden py-1">
        {!data && loading ? (
          <div className="flex h-40 items-center justify-center">
            <Spinner />
          </div>
        ) : data && data.items.length === 0 ? (
          isFiltered ? (
            <EmptyState icon={SearchX} title="Nada encontrado" description="Nenhuma movimentação corresponde aos filtros aplicados." />
          ) : (
            <EmptyState
              icon={Inbox}
              title="Nenhuma movimentação neste período"
              description="Registre receitas e despesas para acompanhar suas finanças."
              action={
                <Button variant="primary" icon={Plus} onClick={() => openNewTransaction()}>
                  Nova movimentação
                </Button>
              }
            />
          )
        ) : (
          <div className="divide-y divide-line/60">
            {data?.items.map((t) => <TransactionRow key={t.id} t={t} />)}
          </div>
        )}
        {data && data.items.length < data.totalCount && (
          <div className="flex justify-center border-t border-line py-3">
            <Button size="sm" variant="ghost" loading={loading} onClick={() => setLimit((l) => l + PAGE)}>
              Carregar mais ({data.totalCount - data.items.length} restantes)
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
