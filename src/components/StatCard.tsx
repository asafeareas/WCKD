import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { seedOf } from "../lib/rough";
import { Card, cx } from "./ui";

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone,
  tilt = 0,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon: LucideIcon;
  tone?: "income" | "expense" | "neutral";
  tilt?: number;
}) {
  return (
    <Card shadow seed={seedOf(label)} className="flex min-w-0 flex-col gap-2.5 px-4 pt-3.5 pb-5" style={{ transform: `rotate(${tilt}deg)` }}>
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-[13px] font-bold text-subtle">{label}</span>
        <span
          className={cx(
            "wobbly flex h-7 w-7 shrink-0 items-center justify-center border-2 border-ink",
            tone === "income" ? "bg-income text-[#111]" : tone === "expense" ? "bg-expense text-white" : "bg-marker text-[#111]",
          )}
        >
          <Icon size={15} strokeWidth={2.8} />
        </span>
      </div>
      <div className="truncate text-[22px] leading-none font-bold">{value}</div>
      {hint && <div className="truncate text-xs text-subtle">{hint}</div>}
    </Card>
  );
}
