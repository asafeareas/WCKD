import { ChevronLeft, ChevronRight } from "lucide-react";
import { isCurrentPeriod, periodStore, resetPeriod, shiftPeriod } from "../lib/app-state";
import { MONTHS } from "../lib/format";
import { Segmented, cx } from "./ui";

/** Navegação entre meses (ou anos). O período é compartilhado por todas as telas. */
export function PeriodPicker({ allowYear = false }: { allowYear?: boolean }) {
  const p = periodStore.use();
  const mode = allowYear ? p.mode : "month";
  const label = mode === "year" ? String(p.year) : `${MONTHS[p.month - 1]} ${p.year}`;
  const current = isCurrentPeriod({ ...p, mode });

  return (
    <div className="flex items-center gap-2">
      {allowYear && (
        <Segmented
          size="sm"
          value={p.mode}
          onChange={(m) => periodStore.set({ ...p, mode: m })}
          options={[
            { value: "month", label: "Mês" },
            { value: "year", label: "Ano" },
          ]}
        />
      )}
      <div className="wobbly flex h-8.5 items-center border-2 border-ink bg-surface">
        <button
          onClick={() => periodStore.set(shiftPeriod({ ...p, mode }, -1))}
          className="flex h-full w-8 items-center justify-center text-fg hover:bg-marker hover:text-[#111]"
          aria-label="Período anterior"
        >
          <ChevronLeft size={18} strokeWidth={3} />
        </button>
        <span className="tabular min-w-34 px-1 text-center text-[14px] font-bold text-fg">{label}</span>
        <button
          onClick={() => periodStore.set(shiftPeriod({ ...p, mode }, 1))}
          className="flex h-full w-8 items-center justify-center text-fg hover:bg-marker hover:text-[#111]"
          aria-label="Próximo período"
        >
          <ChevronRight size={18} strokeWidth={3} />
        </button>
      </div>
      <button
        onClick={() => resetPeriod(mode)}
        disabled={current}
        className={cx(
          "wobbly h-8 px-2.5 text-xs font-bold transition-colors",
          current ? "text-faint" : "text-fg underline decoration-wavy decoration-accent underline-offset-4 hover:bg-surface-2",
        )}
      >
        {mode === "year" ? "Ano atual" : "Mês atual"}
      </button>
    </div>
  );
}
