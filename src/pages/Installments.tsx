import { useEffect, useMemo, useState } from "react";
import { CreditCard, List, Pencil, Plus, Trash2 } from "lucide-react";
import { api } from "../lib/api";
import { formatBRL, formatDate, todayISO } from "../lib/format";
import { mutate, useHideValues, useQuery, useSubmitting } from "../lib/store";
import { validateAmount, validateDate } from "../lib/validation";
import { useCategories } from "../hooks/useCategories";
import { CategoryBadge } from "../components/Icon";
import { confirm, Modal } from "../components/Modal";
import { MoneyInput } from "../components/MoneyInput";
import { Button, Card, EmptyState, ErrorState, Field, IconButton, Input, Money, PageHeader, ProgressBar, Segmented, Select, Spinner, Textarea } from "../components/ui";
import type { InstallmentPlan } from "../types";

/** Mesma regra do backend: a 1ª parcela absorve a diferença de arredondamento. */
export function splitInstallments(total: number, n: number): number[] {
  const base = Math.floor(total / n);
  const rest = total - base * n;
  return Array.from({ length: n }, (_, i) => (i === 0 ? base + rest : base));
}

export default function Installments() {
  const { data, error } = useQuery(api.listInstallments, []);
  const [form, setForm] = useState<{ open: boolean; plan: InstallmentPlan | null }>({ open: false, plan: null });
  const [details, setDetails] = useState<InstallmentPlan | null>(null);

  const totals = useMemo(() => {
    const plans = data ?? [];
    return {
      remaining: plans.reduce((s, p) => s + p.remainingCents, 0),
      active: plans.filter((p) => p.remainingCents > 0).length,
      nextMonth: plans.reduce((s, p) => s + (p.next ? p.next.amountCents : 0), 0),
    };
  }, [data]);

  async function remove(p: InstallmentPlan) {
    const yes = await confirm({
      title: "Excluir parcelamento?",
      message: (
        <>
          <strong className="text-fg">{p.description}</strong> e todas as suas {p.installmentCount} parcelas (inclusive as já pagas) serão
          excluídas permanentemente. Os indicadores dos meses afetados serão recalculados.
        </>
      ),
    });
    if (yes) await mutate(() => api.deleteInstallment(p.id), "Parcelamento excluído.");
  }

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Parcelamentos"
        subtitle="Compras parceladas. Cada parcela conta como despesa apenas no mês do seu vencimento."
        actions={
          <Button variant="primary" icon={Plus} onClick={() => setForm({ open: true, plan: null })}>
            Novo parcelamento
          </Button>
        }
      />
      {error && <ErrorState message={error} />}
      {!data ? (
        <div className="flex h-48 items-center justify-center">
          <Spinner />
        </div>
      ) : data.length === 0 ? (
        <Card>
          <EmptyState
            icon={CreditCard}
            title="Nenhum parcelamento"
            description="Registre compras parceladas para distribuir cada parcela no mês correto e acompanhar quanto ainda falta pagar."
            action={
              <Button variant="primary" icon={Plus} onClick={() => setForm({ open: true, plan: null })}>
                Registrar compra parcelada
              </Button>
            }
          />
        </Card>
      ) : (
        <>
          <Card className="mb-3 grid grid-cols-3 gap-4 px-5 py-4">
            <div>
              <p className="text-xs text-subtle">Valor restante</p>
              <p className="mt-1 text-lg font-bold">
                <Money cents={totals.remaining} tone="expense" />
              </p>
            </div>
            <div>
              <p className="text-xs text-subtle">Parcelamentos em andamento</p>
              <p className="mt-1 text-lg font-bold">{totals.active}</p>
            </div>
            <div>
              <p className="text-xs text-subtle">Próximas parcelas (soma)</p>
              <p className="mt-1 text-lg font-bold">
                <Money cents={totals.nextMonth} />
              </p>
            </div>
          </Card>
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {data.map((p) => {
              const pct = (p.paidCount / p.installmentCount) * 100;
              const done = p.remainingCents === 0;
              return (
                <Card key={p.id} className="group px-5 py-4">
                  <div className="flex items-center gap-3">
                    <CategoryBadge icon={p.categoryIcon} color={p.categoryColor} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-bold">{p.description}</p>
                      <p className="text-xs text-subtle">
                        {p.installmentCount}x de <Money cents={p.installmentCents} /> · {p.categoryName}
                      </p>
                    </div>
                    <div className="flex opacity-0 transition-opacity group-hover:opacity-100">
                      <IconButton icon={List} label="Ver parcelas" onClick={() => setDetails(p)} />
                      <IconButton icon={Pencil} label="Editar" onClick={() => setForm({ open: true, plan: p })} />
                      <IconButton icon={Trash2} label="Excluir" tone="danger" onClick={() => remove(p)} />
                    </div>
                  </div>
                  <div className="mt-4 mb-2 flex items-center justify-between text-xs">
                    <span className="text-muted">
                      {p.paidCount} de {p.installmentCount} parcelas pagas
                    </span>
                    <span className="text-subtle">
                      {done ? "Quitado" : p.next ? `Próxima: ${p.next.number}ª em ${formatDate(p.next.date)}` : ""}
                    </span>
                  </div>
                  <ProgressBar value={pct} tone="ok" />
                  <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <p className="text-subtle">Total</p>
                      <p className="mt-0.5 text-[13px]">
                        <Money cents={p.totalCents} />
                      </p>
                    </div>
                    <div>
                      <p className="text-subtle">Pago</p>
                      <p className="mt-0.5 text-[13px]">
                        <Money cents={p.paidCents} />
                      </p>
                    </div>
                    <div>
                      <p className="text-subtle">Restante</p>
                      <p className="mt-0.5 text-[13px]">
                        <Money cents={p.remainingCents} tone={p.remainingCents > 0 ? "expense" : undefined} />
                      </p>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
          <p className="mt-3 text-xs text-subtle">
            Parcelas com vencimento até hoje são consideradas pagas. As futuras aparecem nos meses correspondentes como despesas planejadas.
          </p>
        </>
      )}
      <InstallmentForm open={form.open} plan={form.plan} onClose={() => setForm({ open: false, plan: null })} />
      <ParcelsDialog plan={details} onClose={() => setDetails(null)} />
    </div>
  );
}

function InstallmentForm({ open, plan, onClose }: { open: boolean; plan: InstallmentPlan | null; onClose: () => void }) {
  const { byKind } = useCategories();
  const hidden = useHideValues();
  const [description, setDescription] = useState("");
  const [mode, setMode] = useState<"total" | "parcel">("total");
  const [amount, setAmount] = useState<number | null>(null);
  const [count, setCount] = useState("2");
  const [firstDate, setFirstDate] = useState(todayISO());
  const [categoryId, setCategoryId] = useState<number | "">("");
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, run] = useSubmitting();

  useEffect(() => {
    if (!open) return;
    setDescription(plan?.description ?? "");
    setMode("total");
    setAmount(plan?.totalCents ?? null);
    setCount(String(plan?.installmentCount ?? 2));
    setFirstDate(plan?.firstDate ?? todayISO());
    setCategoryId(plan?.categoryId ?? "");
    setNotes(plan?.notes ?? "");
    setErrors({});
  }, [open, plan]);

  const n = Number(count);
  const validCount = Number.isInteger(n) && n >= 2 && n <= 420;
  const total = amount != null && validCount ? (mode === "total" ? amount : amount * n) : null;
  const parts = total != null && total >= n ? splitInstallments(total, n) : null;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!description.trim()) errs.description = "Informe a descrição.";
    const a = validateAmount(amount);
    if (a) errs.amount = a;
    if (!validCount) errs.count = "Entre 2 e 420 parcelas.";
    else if (total != null && total < n) errs.amount = "Valor baixo demais para essa quantidade de parcelas.";
    if (categoryId === "") errs.category = "Escolha uma categoria.";
    const d = validateDate(firstDate);
    if (d) errs.date = d;
    setErrors(errs);
    if (Object.keys(errs).length || total == null) return;
    if (plan) {
      const yes = await confirm({
        title: "Atualizar parcelamento?",
        message: "As parcelas serão recalculadas a partir dos novos dados. Alterações feitas manualmente em parcelas individuais serão descartadas.",
        confirmLabel: "Atualizar",
        tone: "default",
      });
      if (!yes) return;
    }
    const input = { description: description.trim(), totalCents: total, installmentCount: n, firstDate, categoryId: categoryId as number, notes: notes.trim() || null };
    const ok = await run(() =>
      mutate(() => (plan ? api.updateInstallment(plan.id, input) : api.createInstallment(input)), plan ? "Parcelamento atualizado." : "Parcelamento registrado."),
    );
    if (ok) onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={plan ? "Editar parcelamento" : "Nova compra parcelada"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" type="submit" form="inst-form" loading={busy}>
            Salvar
          </Button>
        </>
      }
    >
      <form id="inst-form" onSubmit={save} className="flex flex-col gap-4" noValidate>
        <Field label="Descrição" htmlFor="inst-desc" error={errors.description}>
          <Input id="inst-desc" placeholder="Ex.: Notebook, Geladeira" maxLength={120} value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <Segmented
          size="sm"
          value={mode}
          onChange={(m) => {
            if (amount != null && validCount) setAmount(m === "parcel" ? Math.round(amount / n) : amount * n);
            setMode(m);
          }}
          options={[
            { value: "total", label: "Informar valor total" },
            { value: "parcel", label: "Informar valor da parcela" },
          ]}
        />
        <div className="grid grid-cols-[1fr_8rem] gap-3">
          <Field label={mode === "total" ? "Valor total" : "Valor de cada parcela"} htmlFor="inst-amount" error={errors.amount}>
            <MoneyInput id="inst-amount" value={amount} onChange={setAmount} invalid={!!errors.amount} />
          </Field>
          <Field label="Parcelas" htmlFor="inst-count" error={errors.count}>
            <Input id="inst-count" type="number" min={2} max={420} value={count} onChange={(e) => setCount(e.target.value)} />
          </Field>
        </div>
        {parts && (
          <p className="-mt-1 wobbly border-2 border-dashed border-line bg-surface-2 px-3 py-2 text-xs text-muted">
            {hidden ? (
              `${n} parcelas`
            ) : parts[0] === parts[1] ? (
              <>
                {n}x de <span className="text-fg">{formatBRL(parts[1])}</span> = {formatBRL(total!)}
              </>
            ) : (
              <>
                1ª parcela de <span className="text-fg">{formatBRL(parts[0])}</span> + {n - 1}x de{" "}
                <span className="text-fg">{formatBRL(parts[1])}</span> = {formatBRL(total!)}
              </>
            )}
          </p>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Data da 1ª parcela" htmlFor="inst-date" error={errors.date}>
            <Input id="inst-date" type="date" value={firstDate} onChange={(e) => setFirstDate(e.target.value)} />
          </Field>
          <Field label="Categoria" error={errors.category}>
            <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value ? Number(e.target.value) : "")}>
              <option value="">Selecione</option>
              {byKind.expense.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Observações (opcional)">
          <Textarea maxLength={1000} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </form>
    </Modal>
  );
}

function ParcelsDialog({ plan, onClose }: { plan: InstallmentPlan | null; onClose: () => void }) {
  const { data } = useQuery(() => (plan ? api.installmentParcels(plan.id) : Promise.resolve([])), [plan?.id]);
  const today = todayISO();
  return (
    <Modal open={!!plan} onClose={onClose} title={plan?.description ?? ""} description="Parcelas e vencimentos">
      {!data ? (
        <Spinner />
      ) : (
        <ul className="-mx-1 max-h-96 overflow-y-auto">
          {data.map((t) => (
            <li key={t.id} className="grid grid-cols-[3rem_1fr_auto_5rem] items-center gap-2 wobbly px-1 py-1.5 text-[13px]">
              <span className="tabular text-subtle">
                {t.installmentNumber}/{t.installmentCount}
              </span>
              <span className="text-muted">{formatDate(t.date)}</span>
              <Money cents={t.amountCents} />
              <span className={t.date <= today ? "text-right text-xs text-income-soft" : "text-right text-xs text-subtle"}>
                {t.date <= today ? "Paga" : "Pendente"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
