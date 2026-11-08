import { X } from "lucide-react";
import { dismissToast, useToasts } from "../lib/store";
import { cx } from "./ui";

export function Toaster() {
  const toasts = useToasts();
  return (
    <div className="pointer-events-none fixed right-5 bottom-5 z-[60] flex w-80 flex-col gap-2.5" aria-live="polite">
      {toasts.map((t, i) => (
        <div
          key={t.id}
          role={t.tone === "error" ? "alert" : "status"}
          className={cx(
            "sketch pointer-events-auto flex items-start gap-2.5 px-3.5 py-3 text-[14px] font-bold animate-slide-up",
            t.tone === "success" ? "bg-accent text-[#111]" : "bg-expense text-white",
          )}
          style={{ transform: `rotate(${i % 2 ? 1 : -1}deg)` }}
        >
          <span className="text-base leading-none">{t.tone === "success" ? "✔" : "✗"}</span>
          <p className="flex-1">{t.message}</p>
          <button onClick={() => dismissToast(t.id)} aria-label="Fechar" className="opacity-70 hover:opacity-100">
            <X size={15} strokeWidth={3} />
          </button>
        </div>
      ))}
    </div>
  );
}
