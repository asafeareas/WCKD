import { useEffect, useMemo, useState } from "react";
import { Copy, Pencil, Plus, Target, Trash2 } from "lucide-react";
import { api } from "../lib/api";
import { periodMonthKey, periodStore } from "../lib/app-state";
import { formatPct, monthLabel } from "../lib/format";
import { mutate, toast, useQuery, useSubmitting } from "../lib/store";
import { validateAmount } from "../lib/validation";
import { useCategories } from "../hooks/useCategories";
import { CategoryBadge } from "../components/Icon";
import { confirm, Modal } from "../components/Modal";
import { MoneyInput } from "../components/MoneyInput";
import { PeriodPicker } from "../components/PeriodPicker";
import { Button, Card, EmptyState, ErrorState, Field, IconButton, Money, PageHeader, ProgressBar, Select, Spinner, cx } from "../components/ui";
import type { BudgetLine } from "../types";

const STATUS = {
  ok: { label: "Dentro do orçamento", cls: "border-2 border-ink bg-income text-[#111]" },
  warning: { label: "Próximo do limite", cls: "border-2 border-ink bg-warn text-[#111]" },
  over: { label: "Orçamento ultrapassado", cls: "border-2 border-ink bg-expense text-white" },
};

export default function Budgets() {
  const period = periodStore.use();
  const month = periodMonthKey(period);
  const { data, error } = useQuery(() => api.budgets(month), [month]);
  const { byKind } = useCategories();
  const [form, setForm] = useState<{ open: boolean; line: BudgetLine | null }>({ open: false, line: null });

  const available = useMemo(
    () => byKind.expense.filter((c) => !data?.lines.some((l) => l.categoryId === c.id)),
    [byKind.expense, data],
  );

  async function copyPrevious() {
    const n = await mutate(() => api.copyBudgets(month));
    if (n != null) toast(n ? `${n} ${n === 1 ? "orçamento copiado" : "orçamentos copiados"} do mês anterior.` : "Nenhum orçamento novo para copiar.");
  }

  async function remove(l: BudgetLine) {
    const yes = await confirm({ title: "Remover orçamento?", message: `O orçamento de ${l.name} em ${monthLabel(month).toLowerCase()} será removido. Os gastos não são alterados.`, confirmLabel: "Remover" });
    if (yes) await mutate(() => api.removeBudget(l.categoryId, month), "Orçamento removido.");
  }

  const totalPct = data && data.totalLimitCents > 0 ? (data.totalSpentCents / data.totalLimitCents) * 100 : 0;

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Orçamentos"
        subtitle="Limites de gastos por categoria. Cada mês é independente."
        actions={
          <>
            <PeriodPicker />
            {data?.previousMonthHasBudgets && (
              <Button icon={Copy} onClick={copyPrevious}>
                Copiar do mês anterior
              </Button>
            )}
            <Button variant="primary" icon={Plus} onClick={() => setForm({ open: true, line: null })} disabled={!available.length}>
              Definir orçamento
            </Button>
          </>
        }
      />
      {error && <ErrorState message={error} />}
      {!data ? (
        <div className="flex h-48 items-center justify-center">
          <Spinner />
        </div>
      ) : data.lines.length === 0 ? (
        <Card>
          <EmptyState
            icon={Target}
            title={`Nenhum orçamento em ${monthLabel(month).toLowerCase()}`}
            description="Defina quanto você pretende gastar em cada categoria e acompanhe o progresso ao longo do mês."
            action={
              <div className="flex gap-2">
                <Button variant="primary" icon={Plus} onClick={() => setForm({ open: true, line: null })}>
                  Definir orçamento
                </Button>
                {data.previousMonthHasBudgets && (
                  <Button icon={Copy} onClick={copyPrevious}>
                    Copiar do mês anterior
                  </Button>
                )}
              </div>
            }
          />
        </Card>
      ) : (
        <>
          <Card className="mb-3 grid grid-cols-1 gap-4 px-5 py-4 md:grid-cols-4">
            <Summary label="Planejado" value={<Money cents={data.totalLimitCents} />} />
            <Summary label="Gasto" value={<Money cents={data.totalSpentCents} tone="expense" />} />
            <Summary
              label="Restante"
              value={<Money cents={data.totalLimitCents - data.totalSpentCents} tone={data.totalLimitCents - data.totalSpentCents < 0 ? "expense" : undefined} />}
            />
            <Summary
              label="Consumido"
              value={
                <div className="flex items-center gap-3">
                  <span className="tabular">{formatPct(totalPct)}</span>
                  <div className="flex-1">
                    <ProgressBar value={totalPct} tone={totalPct > 100 ? "over" : totalPct >= 80 ? "warning" : "ok"} />
                  </div>
                </div>
              }
            />
          </Card>
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {data.lines.map((l) => (
              <Card key={l.categoryId} className="group px-5 py-4">
                <div className="flex items-center gap-3">
                  <CategoryBadge icon={l.icon} color={l.color} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-bold">{l.name}</p>
                    <span className={cx("mt-1 inline-flex h-5 items-center wobbly px-1.5 text-[11px] font-bold", STATUS[l.status].cls)}>
                      {STATUS[l.status].label}
                    </span>
                  </div>
                  <div className="flex opacity-0 transition-opacity group-hover:opacity-100">
                    <IconButton icon={Pencil} label="Editar limite" onClick={() => setForm({ open: true, line: l })} />
                    <IconButton icon={Trash2} label="Remover" tone="danger" onClick={() => remove(l)} />
                  </div>
                </div>
                <div className="mt-4 mb-2">
                  <ProgressBar value={l.usedPct} tone={l.status} />
                </div>
                <div className="grid grid-cols-4 gap-2 text-xs">
                  <Cell label="Planejado" value={<Money cents={l.limitCents} />} />
                  <Cell label="Gasto" value={<Money cents={l.spentCents} />} />
                  <Cell label={l.remainingCents < 0 ? "Excedido" : "Restante"} value={<Money cents={Math.abs(l.remainingCents)} tone={l.remainingCents < 0 ? "expense" : undefined} />} />
                  <Cell label="Consumido" value={<span className="tabular">{formatPct(l.usedPct)}</span>} />
                </div>
              </Card>
            ))}
          </div>
          {data.unbudgetedSpentCents > 0 && (
            <p className="mt-3 text-xs text-subtle">
              Gastos em categorias sem orçamento neste mês: <Money cents={data.unbudgetedSpentCents} className="text-muted" />
            </p>
          )}
        </>
      )}

      <BudgetForm
        open={form.open}
        line={form.line}
        month={month}
        options={available}
        onClose={() => setForm({ open: false, line: null })}
      />
    </div>
  );
}

function Summary({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-subtle">{label}</p>
      <div className="mt-1 text-lg font-bold">{value}</div>
    </div>
  );
}

function Cell({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-subtle">{label}</p>
      <p className="mt-0.5 text-[13px] text-fg">{value}</p>
    </div>
  );
}

function BudgetForm({
  open,
  line,
  month,
  options,
  onClose,
}: {
  open: boolean;
  line: BudgetLine | null;
  month: string;
  options: { id: number; name: string }[];
  onClose: () => void;
}) {
  const [categoryId, setCategoryId] = useState<number | "">("");
  const [limit, setLimit] = useState<number | null>(null);
  const [err, setErr] = useState<string | undefined>();
  const [busy, run] = useSubmitting();

  useEffect(() => {
    if (!open) return;
    setCategoryId(line?.categoryId ?? "");
    setLimit(line?.limitCents ?? null);
    setErr(undefined);
  }, [open, line]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (categoryId === "") return setErr("Escolha uma categoria.");
    const amountErr = validateAmount(limit);
    if (amountErr) return setErr(amountErr);
    const ok = await run(() => mutate(() => api.setBudget(categoryId, month, limit!).then(() => true), "Orçamento salvo."));
    if (ok) onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      width="sm"
      title={line ? `Orçamento de ${line.name}` : "Definir orçamento"}
      description={monthLabel(month)}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" type="submit" form="budget-form" loading={busy}>
            Salvar
          </Button>
        </>
      }
    >
      <form id="budget-form" onSubmit={save} className="flex flex-col gap-4" noValidate>
        {!line && (
          <Field label="Categoria">
            <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value ? Number(e.target.value) : "")}>
              <option value="">Selecione</option>
              {options.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field label="Limite para o mês" htmlFor="budget-limit" error={err}>
          <MoneyInput id="budget-limit" value={limit} onChange={setLimit} invalid={!!err} />
        </Field>
      </form>
    </Modal>
  );
}
