import { useEffect, useState } from "react";
import { AlertCircle, CalendarClock, Check, History, Pencil, Plus, Trash2, Undo2 } from "lucide-react";
import { api } from "../lib/api";
import { periodMonthKey, periodStore } from "../lib/app-state";
import { formatDate, monthLabel, todayISO } from "../lib/format";
import { mutate, useQuery, useSubmitting } from "../lib/store";
import { validateAmount, validateDate } from "../lib/validation";
import { useCategories } from "../hooks/useCategories";
import { CategoryBadge } from "../components/Icon";
import { confirm, Modal } from "../components/Modal";
import { MoneyInput } from "../components/MoneyInput";
import { PeriodPicker } from "../components/PeriodPicker";
import { Button, Card, CardHeader, EmptyState, ErrorState, Field, IconButton, Input, Money, PageHeader, Select, Spinner, Textarea, cx } from "../components/ui";
import type { Frequency, Occurrence, Recurring as R, RecurringInput } from "../types";

const FREQ: Record<Frequency, string> = { weekly: "Semanal", monthly: "Mensal", yearly: "Anual" };

export default function Recurring() {
  const period = periodStore.use();
  const month = periodMonthKey(period);
  const { data, error } = useQuery(() => api.recurringOverview(month), [month]);
  const [form, setForm] = useState<{ open: boolean; item: R | null }>({ open: false, item: null });
  const [paying, setPaying] = useState<Occurrence | null>(null);
  const [history, setHistory] = useState<R | null>(null);

  async function undo(o: Occurrence) {
    if (o.transactionId == null) return;
    const yes = await confirm({
      title: "Desfazer pagamento?",
      message: `A despesa registrada para "${o.name}" (vencimento ${formatDate(o.dueDate)}) será excluída e o vencimento voltará a ficar pendente.`,
      confirmLabel: "Desfazer",
    });
    if (yes) await mutate(() => api.deleteTransaction(o.transactionId!), "Pagamento desfeito.");
  }

  async function remove(r: R) {
    const yes = await confirm({
      title: "Excluir conta recorrente?",
      message: (
        <>
          O cadastro de <strong className="text-fg">{r.name}</strong> será excluído.{" "}
          {r.paymentCount > 0 && `Os ${r.paymentCount} pagamento(s) já registrados continuam como despesas no histórico.`}
        </>
      ),
    });
    if (yes) await mutate(() => api.deleteRecurring(r.id), "Conta recorrente excluída.");
  }

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Contas recorrentes"
        subtitle="Previsões de gastos fixos. Só viram despesa quando você marca o vencimento como pago."
        actions={
          <>
            <PeriodPicker />
            <Button variant="primary" icon={Plus} onClick={() => setForm({ open: true, item: null })}>
              Nova conta
            </Button>
          </>
        }
      />
      {error && <ErrorState message={error} />}
      {!data ? (
        <div className="flex h-48 items-center justify-center">
          <Spinner />
        </div>
      ) : data.items.length === 0 ? (
        <Card>
          <EmptyState
            icon={CalendarClock}
            title="Nenhuma conta recorrente"
            description="Cadastre internet, aluguel, academia, assinaturas e outros gastos fixos para acompanhar vencimentos e pagamentos."
            action={
              <Button variant="primary" icon={Plus} onClick={() => setForm({ open: true, item: null })}>
                Cadastrar conta
              </Button>
            }
          />
        </Card>
      ) : (
        <>
          <Card className="mb-3 grid grid-cols-2 gap-4 px-5 py-4 md:grid-cols-4">
            <Summary label="Total recorrente (≈ mensal)" value={<Money cents={data.monthlyTotalCents} />} />
            <Summary label={`Previsto em ${monthLabel(month).split(" ")[0].toLowerCase()}`} value={<Money cents={data.monthExpectedCents} />} />
            <Summary label="Pago no mês" value={<Money cents={data.monthPaidCents} tone="income" />} />
            <Summary label="Pendente no mês" value={<Money cents={data.monthPendingCents} tone={data.monthPendingCents > 0 ? "expense" : undefined} />} />
          </Card>

          {data.overdue.length > 0 && (
            <Card className="mb-3">
              <CardHeader
                title={
                  <span className="flex items-center gap-2 text-expense-soft">
                    <AlertCircle size={15} /> Contas em atraso
                  </span>
                }
                subtitle="Vencimentos não pagos nos últimos 90 dias"
              />
              <OccurrenceList items={data.overdue} onPay={setPaying} onUndo={undo} />
            </Card>
          )}

          <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
            <Card>
              <CardHeader title={`Vencimentos de ${monthLabel(month).toLowerCase()}`} subtitle="Pagos e pendentes" />
              {data.monthOccurrences.length ? (
                <OccurrenceList items={data.monthOccurrences} onPay={setPaying} onUndo={undo} />
              ) : (
                <EmptyState compact icon={CalendarClock} title="Nenhum vencimento neste mês" />
              )}
            </Card>
            <Card>
              <CardHeader title="Próximos vencimentos" subtitle="Próximos 30 dias, ainda não pagos" />
              {data.upcoming.length ? (
                <OccurrenceList items={data.upcoming} onPay={setPaying} onUndo={undo} />
              ) : (
                <EmptyState compact icon={Check} title="Nada a pagar nos próximos 30 dias" />
              )}
            </Card>
          </div>

          <Card className="mt-3">
            <CardHeader title="Contas cadastradas" subtitle={`${data.items.length} ${data.items.length === 1 ? "conta" : "contas"}`} />
            <ul className="mt-2 pb-2">
              {data.items.map((r) => (
                <li key={r.id} className={cx("group flex items-center gap-3 px-5 py-2.5 hover:bg-surface-2", !r.active && "opacity-50")}>
                  <CategoryBadge icon={r.categoryIcon} color={r.categoryColor} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-bold">
                      {r.name} {!r.active && <span className="text-xs font-normal text-subtle">(inativa)</span>}
                    </p>
                    <p className="text-xs text-subtle">
                      {FREQ[r.frequency]} · {r.categoryName}
                      {r.nextDueDate && ` · próximo vencimento ${formatDate(r.nextDueDate)}`}
                      {r.endDate && ` · até ${formatDate(r.endDate)}`}
                    </p>
                  </div>
                  <Money cents={r.amountCents} className="text-[13px] font-bold" />
                  <div className="flex opacity-0 transition-opacity group-hover:opacity-100">
                    <IconButton icon={History} label="Histórico de pagamentos" onClick={() => setHistory(r)} />
                    <IconButton icon={Pencil} label="Editar" onClick={() => setForm({ open: true, item: r })} />
                    <IconButton icon={Trash2} label="Excluir" tone="danger" onClick={() => remove(r)} />
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}

      <RecurringForm open={form.open} item={form.item} onClose={() => setForm({ open: false, item: null })} />
      <PayDialog occurrence={paying} onClose={() => setPaying(null)} />
      <HistoryDialog item={history} onClose={() => setHistory(null)} />
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

function OccurrenceList({ items, onPay, onUndo }: { items: Occurrence[]; onPay: (o: Occurrence) => void; onUndo: (o: Occurrence) => void }) {
  return (
    <ul className="mt-2 pb-2">
      {items.map((o) => (
        <li key={`${o.recurringId}-${o.dueDate}`} className="flex items-center gap-3 px-5 py-2 hover:bg-surface-2">
          <CategoryBadge icon={o.categoryIcon} color={o.categoryColor} size={28} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-bold">{o.name}</p>
            <p className="text-xs text-subtle">
              Vence {formatDate(o.dueDate)}
              {o.paidDate && ` · pago em ${formatDate(o.paidDate)}`}
            </p>
          </div>
          <Money cents={o.paidCents ?? o.expectedCents} className="text-[13px]" />
          {o.status === "paid" ? (
            <button
              onClick={() => onUndo(o)}
              title="Desfazer pagamento"
              className="group/btn inline-flex h-7 w-24 items-center justify-center gap-1 wobbly border-2 border-ink bg-income text-xs font-bold text-[#111] hover:bg-surface-3 hover:text-fg"
            >
              <Check size={13} className="group-hover/btn:hidden" />
              <Undo2 size={13} className="hidden group-hover/btn:block" />
              <span className="group-hover/btn:hidden">Pago</span>
              <span className="hidden group-hover/btn:inline">Desfazer</span>
            </button>
          ) : (
            <Button size="sm" variant={o.status === "overdue" ? "danger" : "secondary"} className="w-24" onClick={() => onPay(o)}>
              Pagar
            </Button>
          )}
        </li>
      ))}
    </ul>
  );
}

function RecurringForm({ open, item, onClose }: { open: boolean; item: R | null; onClose: () => void }) {
  const { byKind } = useCategories();
  const [v, setV] = useState<RecurringInput>(empty());
  const [amount, setAmount] = useState<number | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, run] = useSubmitting();

  function empty(): RecurringInput {
    return { name: "", amountCents: 0, categoryId: 0, frequency: "monthly", startDate: todayISO(), endDate: null, notes: null, active: true };
  }

  useEffect(() => {
    if (!open) return;
    const base = item
      ? { name: item.name, amountCents: item.amountCents, categoryId: item.categoryId, frequency: item.frequency, startDate: item.startDate, endDate: item.endDate, notes: item.notes, active: item.active }
      : empty();
    setV(base);
    setAmount(item ? item.amountCents : null);
    setErrors({});
  }, [open, item]);

  const set = (p: Partial<RecurringInput>) => setV((s) => ({ ...s, ...p }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!v.name.trim()) errs.name = "Informe o nome.";
    const a = validateAmount(amount);
    if (a) errs.amount = a;
    if (!v.categoryId) errs.category = "Escolha uma categoria.";
    const d = validateDate(v.startDate);
    if (d) errs.start = d;
    if (v.endDate && (validateDate(v.endDate) || v.endDate < v.startDate)) errs.end = "Data de término inválida.";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    const input = { ...v, name: v.name.trim(), amountCents: amount!, notes: v.notes?.trim() || null, endDate: v.endDate || null };
    const ok = await run(() =>
      mutate(() => (item ? api.updateRecurring(item.id, input) : api.createRecurring(input)), item ? "Conta atualizada." : "Conta recorrente cadastrada."),
    );
    if (ok) onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={item ? "Editar conta recorrente" : "Nova conta recorrente"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" type="submit" form="rec-form" loading={busy}>
            Salvar
          </Button>
        </>
      }
    >
      <form id="rec-form" onSubmit={save} className="flex flex-col gap-4" noValidate>
        <Field label="Nome" htmlFor="rec-name" error={errors.name}>
          <Input id="rec-name" placeholder="Ex.: Internet, Aluguel, Academia" maxLength={120} value={v.name} onChange={(e) => set({ name: e.target.value })} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Valor" htmlFor="rec-amount" error={errors.amount} hint="Pode ser ajustado em cada pagamento">
            <MoneyInput id="rec-amount" value={amount} onChange={setAmount} invalid={!!errors.amount} />
          </Field>
          <Field label="Frequência">
            <Select value={v.frequency} onChange={(e) => set({ frequency: e.target.value as Frequency })}>
              <option value="monthly">Mensal</option>
              <option value="weekly">Semanal</option>
              <option value="yearly">Anual</option>
            </Select>
          </Field>
        </div>
        <Field label="Categoria" error={errors.category}>
          <Select value={v.categoryId || ""} onChange={(e) => set({ categoryId: Number(e.target.value) || 0 })}>
            <option value="">Selecione</option>
            {byKind.expense.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Primeiro vencimento" htmlFor="rec-start" error={errors.start} hint="Define o dia de vencimento">
            <Input id="rec-start" type="date" value={v.startDate} onChange={(e) => set({ startDate: e.target.value })} />
          </Field>
          <Field label="Término (opcional)" htmlFor="rec-end" error={errors.end}>
            <Input id="rec-end" type="date" value={v.endDate ?? ""} onChange={(e) => set({ endDate: e.target.value || null })} />
          </Field>
        </div>
        <Field label="Observações (opcional)">
          <Textarea maxLength={1000} value={v.notes ?? ""} onChange={(e) => set({ notes: e.target.value })} />
        </Field>
        {item && (
          <label className="flex cursor-pointer items-center gap-2.5 text-[13px] text-muted">
            <input type="checkbox" checked={v.active} onChange={(e) => set({ active: e.target.checked })} className="h-4 w-4 accent-[#22c55e]" />
            Conta ativa (desmarque para pausar sem perder o histórico)
          </label>
        )}
      </form>
    </Modal>
  );
}

function PayDialog({ occurrence: o, onClose }: { occurrence: Occurrence | null; onClose: () => void }) {
  const [amount, setAmount] = useState<number | null>(null);
  const [date, setDate] = useState(todayISO());
  const [err, setErr] = useState<string | undefined>();
  const [busy, run] = useSubmitting();

  useEffect(() => {
    if (!o) return;
    setAmount(o.expectedCents);
    setDate(o.dueDate < todayISO() ? o.dueDate : todayISO());
    setErr(undefined);
  }, [o]);

  async function pay(e: React.FormEvent) {
    e.preventDefault();
    if (!o) return;
    const a = validateAmount(amount) ?? validateDate(date);
    if (a) return setErr(a);
    const ok = await run(() =>
      mutate(() => api.payRecurring({ recurringId: o.recurringId, dueDate: o.dueDate, paidDate: date, amountCents: amount! }), "Pagamento registrado como despesa."),
    );
    if (ok) onClose();
  }

  return (
    <Modal
      open={!!o}
      onClose={onClose}
      width="sm"
      title={`Pagar ${o?.name ?? ""}`}
      description={o ? `Vencimento em ${formatDate(o.dueDate)}. Uma despesa será registrada.` : undefined}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" type="submit" form="pay-form" loading={busy}>
            Confirmar pagamento
          </Button>
        </>
      }
    >
      <form id="pay-form" onSubmit={pay} className="flex flex-col gap-4" noValidate>
        <Field label="Valor pago" htmlFor="pay-amount" error={err}>
          <MoneyInput id="pay-amount" value={amount} onChange={setAmount} invalid={!!err} />
        </Field>
        <Field label="Data do pagamento" htmlFor="pay-date">
          <Input id="pay-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
      </form>
    </Modal>
  );
}

function HistoryDialog({ item, onClose }: { item: R | null; onClose: () => void }) {
  const { data } = useQuery(() => (item ? api.recurringHistory(item.id) : Promise.resolve([])), [item?.id]);
  return (
    <Modal open={!!item} onClose={onClose} title={`Histórico · ${item?.name ?? ""}`} description="Pagamentos registrados">
      {!data?.length ? (
        <p className="py-6 text-center text-[13px] text-subtle">Nenhum pagamento registrado ainda.</p>
      ) : (
        <ul className="-mx-1 max-h-80 overflow-y-auto">
          {data.map((t) => (
            <li key={t.id} className="flex items-center justify-between wobbly px-1 py-2 text-[13px]">
              <span className="text-muted">Pago em {formatDate(t.date)}</span>
              <Money cents={t.amountCents} />
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
