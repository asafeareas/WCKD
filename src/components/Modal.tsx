import { useEffect, useRef, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, X } from "lucide-react";
import { Button, cx } from "./ui";
import { RoughFrame } from "../lib/rough";

const modalStack: object[] = [];

/** True quando há algum modal aberto (atalhos globais ficam desativados). */
export const isModalOpen = () => modalStack.length > 0;

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  width = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  width?: "sm" | "md" | "lg";
}) {
  const panel = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const token = {};
    modalStack.push(token);
    const onKey = (e: KeyboardEvent) => {
      // Apenas o modal do topo responde ao Esc
      if (e.key === "Escape" && modalStack[modalStack.length - 1] === token) {
        e.preventDefault();
        closeRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    // Foca o primeiro campo do modal
    requestAnimationFrame(() => {
      const el = panel.current?.querySelector<HTMLElement>("[data-autofocus], input, select, textarea, button");
      el?.focus();
    });
    return () => {
      window.removeEventListener("keydown", onKey);
      modalStack.splice(modalStack.indexOf(token), 1);
      prev?.focus?.();
    };
  }, [open]);

  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[#111]/45 px-4 pt-[5vh] pb-8 animate-fade-in">
      <div className="absolute inset-0" onMouseDown={onClose} aria-hidden />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        className={cx(
          "relative isolate w-full pr-1.5 pb-1.5 animate-pop-in",
          width === "sm" ? "max-w-sm" : width === "lg" ? "max-w-2xl" : "max-w-lg",
        )}
      >
        <RoughFrame shadow seed={31} strokeWidth={2.6} />
        <div className="flex items-start justify-between gap-4 px-6 pt-5">
          <div>
            <h2 className="font-display text-[21px] leading-tight tracking-wide text-fg">{title}</h2>
            {description && <p className="mt-1 text-[13px] text-subtle">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="wobbly -mr-1.5 border-2 border-transparent p-1 text-fg hover:border-ink hover:bg-expense hover:text-white"
          >
            <X size={18} strokeWidth={3} />
          </button>
        </div>
        <div className="px-6 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t-2 border-dashed border-line px-6 py-3.5">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

// ---------- Confirmação imperativa: `await confirm({...})` ----------

interface ConfirmOptions {
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  tone?: "danger" | "default";
}

let pending: (ConfirmOptions & { resolve: (v: boolean) => void }) | null = null;
const ls = new Set<() => void>();
const emit = () => ls.forEach((l) => l());

export function confirm(opts: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    pending?.resolve(false);
    pending = { ...opts, resolve };
    emit();
  });
}

export function ConfirmHost() {
  const state = useSyncExternalStore(
    (l) => {
      ls.add(l);
      return () => ls.delete(l);
    },
    () => pending,
  );
  const close = (v: boolean) => {
    state?.resolve(v);
    pending = null;
    emit();
  };
  return (
    <Modal
      open={!!state}
      onClose={() => close(false)}
      width="sm"
      title={
        <span className="flex items-center gap-2">
          {state?.tone !== "default" && <AlertTriangle size={16} className="text-expense-soft" />}
          {state?.title}
        </span>
      }
      footer={
        <>
          <Button variant="ghost" onClick={() => close(false)}>
            Cancelar
          </Button>
          <Button variant={state?.tone === "default" ? "primary" : "danger"} onClick={() => close(true)} data-autofocus>
            {state?.confirmLabel ?? "Excluir"}
          </Button>
        </>
      }
    >
      <div className="text-[13px] leading-relaxed text-muted">{state?.message}</div>
    </Modal>
  );
}
