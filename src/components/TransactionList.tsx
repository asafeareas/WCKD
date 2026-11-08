import { memo } from "react";
import { CalendarClock, CreditCard, Pencil } from "lucide-react";
import { openEditTransaction } from "../lib/app-state";
import { formatDate } from "../lib/format";
import type { Transaction } from "../types";
import { CategoryBadge } from "./Icon";
import { KindPill, Money } from "./ui";

export const TransactionRow = memo(function TransactionRow({ t, showKind = true }: { t: Transaction; showKind?: boolean }) {
  return (
    <button
      onClick={() => openEditTransaction(t)}
      className="group grid w-full grid-cols-[auto_1fr_auto] items-center gap-3 px-5 py-2 text-left transition-colors hover:bg-marker/40"
      title="Editar movimentação"
    >
      <CategoryBadge icon={t.categoryIcon} color={t.categoryColor} />
      <div className="min-w-0">
        <p className="flex items-center gap-1.5 truncate text-[14px] font-bold text-fg">
          <span className="truncate">{t.description}</span>
          {t.installmentNumber != null && (
            <span className="wobbly inline-flex shrink-0 items-center gap-1 border-2 border-ink bg-marker px-1 text-[10px] font-bold text-[#111]">
              <CreditCard size={10} /> {t.installmentNumber}/{t.installmentCount}
            </span>
          )}
          {t.recurringId != null && <CalendarClock size={12} className="shrink-0 text-subtle" aria-label="Conta recorrente" />}
        </p>
        <p className="mt-0.5 truncate text-xs text-subtle">
          {t.categoryName} · {formatDate(t.date)}
        </p>
      </div>
      <div className="flex items-center gap-3">
        {showKind && <KindPill kind={t.kind} />}
        <Money cents={t.amountCents} tone={t.kind} signed className="w-28 text-right text-[14px]" />
        <Pencil size={13} className="text-fg opacity-0 transition-opacity group-hover:opacity-100" />
      </div>
    </button>
  );
});
