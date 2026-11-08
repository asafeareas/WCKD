import { useEffect, useMemo, useState, type FormEvent } from "react";
import { ChevronDown, Trash2 } from "lucide-react";
import { api } from "../lib/api";
import { closeTransactionModal, txModalStore } from "../lib/app-state";
import { formatBRL, toISODate, todayISO } from "../lib/format";
import { mutate, useSubmitting } from "../lib/store";
import { hasErrors, validateTransactionForm, type FormErrors, type TransactionFormValues } from "../lib/validation";
import { useCategories } from "../hooks/useCategories";
import type { Kind } from "../types";
import { CategoryPicker } from "./CategoryPicker";
import { confirm, Modal } from "./Modal";
import { MoneyInput } from "./MoneyInput";
import { Button, Field, Input, Segmented, Textarea, cx } from "./ui";

function yesterdayISO() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return toISODate(d);
}

export function TransactionModal() {
  const { open, editing, kind: initialKind } = txModalStore.use();
  const { byKind } = useCategories();

  const [kind, setKind] = useState<Kind>("expense");
  const [description, setDescription] = useState("");
  const [amountCents, setAmountCents] = useState<number | null>(null);
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [date, setDate] = useState(todayISO());
  const [notes, setNotes] = useState("");
  const [showMore, setShowMore] = useState(false);
  const [errors, setErrors] = useState<FormErrors<TransactionFormValues>>({});
  const [busy, run] = useSubmitting();

  // Reinicia o formulário ao abrir
  useEffect(() => {
    if (!open) return;
    setErrors({});
    if (editing) {
      setKind(editing.kind);
      setDescription(editing.description);
      setAmountCents(editing.amountCents);
      setCategoryId(editing.categoryId);
      setDate(editing.date);
      setNotes(editing.notes ?? "");
      setShowMore(!!editing.notes);
    } else {
      setKind(initialKind);
      setDescription("");
      setAmountCents(null);
      setCategoryId(null);
      setDate(todayISO());
      setNotes("");
      setShowMore(false);
    }
  }, [open, editing, initialKind]);

  const categories = byKind[kind];
  const isInstallment = !!editing?.installmentPlanId;

  // Ao trocar o tipo, limpa a categoria se ela não pertencer ao novo tipo
  useEffect(() => {
    if (categoryId != null && categories.length > 0 && !categories.some((c) => c.id === categoryId)) setCategoryId(null);
  }, [categories, categoryId]);

  const values = useMemo(() => ({ description, amountCents, categoryId, date }), [description, amountCents, categoryId, date]);

  async function save(keepOpen: boolean) {
    const errs = validateTransactionForm(values);
    setErrors(errs);
    if (hasErrors(errs)) return;
    const input = {
      description: description.trim(),
      amountCents: amountCents!,
      kind,
      categoryId: categoryId!,
      date,
      notes: notes.trim() || null,
    };
    const ok = await run(() =>
      mutate(
        () => (editing ? api.updateTransaction(editing.id, input) : api.createTransaction(input)),
        editing ? "Movimentação atualizada." : kind === "income" ? "Receita registrada." : "Despesa registrada.",
      ),
    );
    if (!ok) return;
    if (keepOpen && !editing) {
      setDescription("");
      setAmountCents(null);
      setNotes("");
      setErrors({});
      document.getElementById("tx-description")?.focus();
    } else {
      closeTransactionModal();
    }
  }

  async function remove() {
    if (!editing) return;
    const yes = await confirm({
      title: "Excluir movimentação?",
      message: (
        <>
          <strong className="text-fg">{editing.description}</strong> será excluída permanentemente. Os indicadores serão
          recalculados.
        </>
      ),
    });
    if (!yes) return;
    const ok = await mutate(() => api.deleteTransaction(editing.id).then(() => true), "Movimentação excluída.");
    if (ok) closeTransactionModal();
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void save(false);
  };

  return (
    <Modal
      open={open}
      onClose={closeTransactionModal}
      title={editing ? "Editar movimentação" : "Nova movimentação"}
      description={
        isInstallment
          ? `Parcela ${editing!.installmentNumber}/${editing!.installmentCount}. Valor e tipo são definidos pelo parcelamento.`
          : undefined
      }
      footer={
        <div className="flex w-full items-center gap-2">
          {editing && !isInstallment && (
            <Button variant="ghost" icon={Trash2} onClick={remove} className="mr-auto hover:text-expense-soft">
              Excluir
            </Button>
          )}
          <div className="ml-auto flex gap-2">
            {!editing && (
              <Button variant="ghost" onClick={() => save(true)} disabled={busy}>
                Salvar e adicionar outra
              </Button>
            )}
            <Button variant="primary" type="submit" form="tx-form" loading={busy}>
              Salvar
            </Button>
          </div>
        </div>
      }
    >
      <form id="tx-form" onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        {!isInstallment && (
          <Segmented
            value={kind}
            onChange={setKind}
            options={[
              { value: "expense", label: "Despesa", activeClass: "bg-expense text-white" },
              { value: "income", label: "Receita", activeClass: "bg-income text-[#111]" },
            ]}
          />
        )}

        <Field label="Descrição" htmlFor="tx-description" error={errors.description}>
          <Input
            id="tx-description"
            data-autofocus
            placeholder={kind === "expense" ? "Ex.: Mercado, Uber, Netflix" : "Ex.: Salário, Projeto freelance"}
            value={description}
            maxLength={120}
            aria-invalid={!!errors.description || undefined}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>

        <div className="grid grid-cols-[1fr_auto] gap-3">
          <Field label="Valor" htmlFor="tx-amount" error={errors.amountCents}>
            {isInstallment ? (
              <Input id="tx-amount" disabled value={formatBRL(amountCents ?? 0)} />
            ) : (
              <MoneyInput id="tx-amount" large value={amountCents} onChange={setAmountCents} invalid={!!errors.amountCents} />
            )}
          </Field>
          <Field label="Data" htmlFor="tx-date" error={errors.date}>
            <div className="flex flex-col gap-1.5">
              <Input
                id="tx-date"
                type="date"
                value={date}
                className={cx(isInstallment ? "" : "h-12", "w-40")}
                aria-invalid={!!errors.date || undefined}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
          </Field>
        </div>
        <div className="-mt-2 flex justify-end gap-1">
          {[
            ["Hoje", todayISO()],
            ["Ontem", yesterdayISO()],
          ].map(([label, d]) => (
            <button
              key={label}
              type="button"
              onClick={() => setDate(d)}
              className={cx(
                "wobbly px-2 py-0.5 text-xs transition-colors",
                date === d ? "bg-surface-3 text-fg" : "text-subtle hover:text-muted",
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <Field label="Categoria" error={errors.categoryId}>
          <CategoryPicker categories={categories} value={categoryId} onChange={setCategoryId} invalid={!!errors.categoryId} />
        </Field>

        <div>
          <button
            type="button"
            onClick={() => setShowMore((v) => !v)}
            className="flex items-center gap-1 text-xs font-bold text-subtle hover:text-muted"
          >
            <ChevronDown size={14} className={cx("transition-transform", showMore && "rotate-180")} />
            Observações (opcional)
          </button>
          {showMore && (
            <Textarea
              className="mt-2"
              placeholder="Detalhes adicionais"
              maxLength={1000}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          )}
        </div>
        {/* Permite salvar com Enter em qualquer campo */}
        <button type="submit" hidden aria-hidden tabIndex={-1} />
      </form>
    </Modal>
  );
}
