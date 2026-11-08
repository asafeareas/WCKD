import { forwardRef, useMemo, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { Loader2, type LucideIcon } from "lucide-react";
import { formatBRL } from "../lib/format";
import { gen, INK, opts, Paths, RoughFrame, seedOf, useSize } from "../lib/rough";
import { useHideValues } from "../lib/store";

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "sketch bg-accent text-[#111] hover:-translate-y-px hover:shadow-[3px_4px_0_var(--ink)] active:translate-y-0.5 active:shadow-none",
  secondary: "sketch bg-surface text-fg hover:-translate-y-px hover:bg-surface-2 hover:shadow-[3px_4px_0_var(--ink)] active:translate-y-0.5 active:shadow-none",
  ghost: "text-muted hover:text-fg hover:bg-surface-2 wobbly",
  danger: "sketch bg-expense text-white hover:-translate-y-px hover:shadow-[3px_4px_0_var(--ink)] active:translate-y-0.5 active:shadow-none",
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: "sm" | "md";
  icon?: LucideIcon;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", icon: Icon, loading, className, children, disabled, type = "button", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={cx(
        "inline-flex select-none items-center justify-center gap-2 font-bold transition-[transform,box-shadow,background-color] duration-100 disabled:cursor-not-allowed disabled:opacity-45 disabled:transform-none",
        size === "sm" ? "h-8 px-3 text-[13px]" : "h-9.5 px-4 text-[14px]",
        VARIANTS[variant],
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 size={15} className="animate-spin" /> : Icon ? <Icon size={16} strokeWidth={2.5} /> : null}
      {children}
    </button>
  );
});

export function IconButton({
  icon: Icon,
  label,
  className,
  tone,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { icon: LucideIcon; label: string; tone?: "danger" }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      className={cx(
        "wobbly inline-flex h-8 w-8 items-center justify-center border-2 border-transparent text-subtle transition-colors hover:border-ink hover:bg-surface",
        tone === "danger" ? "hover:text-expense-soft" : "hover:text-fg",
        className,
      )}
      {...rest}
    >
      <Icon size={16} strokeWidth={2.4} />
    </button>
  );
}

/** Caixa com contorno rabiscado à mão. */
export function Card({
  className,
  children,
  shadow,
  seed,
  ...rest
}: { className?: string; children: ReactNode; shadow?: boolean; seed?: number } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cx("relative isolate min-w-0", shadow && "pr-1.5 pb-1.5", className)} {...rest}>
      <RoughFrame shadow={shadow} seed={seed} />
      {children}
    </div>
  );
}

export function CardHeader({ title, subtitle, action }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 px-5 pt-4">
      <div className="min-w-0">
        <h3 className="font-display text-[17px] leading-tight tracking-wide text-fg">{title}</h3>
        {subtitle && <p className="mt-0.5 text-[13px] text-subtle">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...rest },
  ref,
) {
  return <input ref={ref} className={cx("field", className)} {...rest} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select(
  { className, children, ...rest },
  ref,
) {
  return (
    <select ref={ref} className={cx("field cursor-pointer pr-8", className)} {...rest}>
      {children}
    </select>
  );
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea(
  { className, ...rest },
  ref,
) {
  return <textarea ref={ref} className={cx("field h-auto min-h-20 resize-none py-2", className)} {...rest} />;
});

export function Field({
  label,
  error,
  hint,
  children,
  htmlFor,
}: {
  label: string;
  error?: string | null;
  hint?: ReactNode;
  children: ReactNode;
  htmlFor?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-[13px] font-bold text-muted">
        {label}
      </label>
      {children}
      {error ? (
        <p role="alert" className="text-[13px] font-bold text-expense-soft">
          ✗ {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-subtle">{hint}</p>
      ) : null}
    </div>
  );
}

/** Controle segmentado (ex.: Receita | Despesa). A opção ativa ganha marca-texto. */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  size = "md",
}: {
  value: T;
  options: { value: T; label: string; activeClass?: string }[];
  onChange: (v: T) => void;
  size?: "sm" | "md";
}) {
  return (
    <div role="radiogroup" className="wobbly inline-flex w-fit gap-0.5 self-start border-2 border-ink bg-surface p-0.5">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={cx(
              "wobbly-2 font-bold transition-colors",
              size === "sm" ? "h-7 px-2.5 text-xs" : "h-8 px-3.5 text-[13px]",
              active ? (o.activeClass ?? "bg-marker text-[#111]") : "text-subtle hover:text-fg",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Valor monetário formatado. Respeita a preferência "ocultar valores". */
export function Money({
  cents,
  tone,
  signed,
  className,
}: {
  cents: number;
  tone?: "income" | "expense" | "auto";
  signed?: boolean;
  className?: string;
}) {
  const hidden = useHideValues();
  const color =
    tone === "income"
      ? "text-income-soft"
      : tone === "expense"
        ? "text-expense-soft"
        : tone === "auto"
          ? cents > 0
            ? "text-income-soft"
            : cents < 0
              ? "text-expense-soft"
              : ""
          : "";
  const sign = signed ? (tone === "expense" ? "− " : tone === "income" ? "+ " : cents > 0 ? "+ " : cents < 0 ? "− " : "") : "";
  const value = signed ? Math.abs(cents) : cents;
  return (
    <span className={cx("tabular whitespace-nowrap font-bold", color, className)}>
      {hidden ? "R$ ✱✱✱✱" : `${sign}${formatBRL(value)}`}
    </span>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 size={22} strokeWidth={2.6} className={cx("animate-spin text-fg", className)} />;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  compact,
}: {
  icon: LucideIcon;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={cx("flex flex-col items-center justify-center text-center", compact ? "py-8" : "py-14")}>
      <div className="sketch mb-3 flex h-12 w-12 -rotate-3 items-center justify-center bg-marker text-[#111]">
        <Icon size={22} strokeWidth={2.4} />
      </div>
      <p className="font-display text-lg text-fg">{title}</p>
      {description && <p className="mt-1 max-w-sm text-[14px] text-subtle">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ message }: { message: string }) {
  return (
    <div role="alert" className="sketch mb-3 bg-expense px-4 py-3 text-sm font-bold text-white">
      ✗ {message}
    </div>
  );
}

const TONE_FILL = { ok: "var(--income)", warning: "var(--warn)", over: "var(--expense)" };

/** Barra de progresso rabiscada com preenchimento hachurado. */
export function ProgressBar({ value, tone, color, seed = 3 }: { value: number; tone?: "ok" | "warning" | "over"; color?: string; seed?: number }) {
  const [ref, { w }] = useSize<HTMLDivElement>();
  const pct = Math.min(100, Math.max(0, value));
  const h = 14;
  const drawables = useMemo(() => {
    if (w < 10) return [];
    const fillW = Math.max(0, ((w - 4) * pct) / 100);
    const out = [];
    if (fillW > 2) {
      out.push(
        gen.rectangle(2, 2, fillW, h - 4, opts(seed + 1, { stroke: "none", fill: color ?? TONE_FILL[tone ?? "ok"], fillStyle: "hachure", hachureGap: 3.2, fillWeight: 2, roughness: 1.2 })),
      );
    }
    out.push(gen.rectangle(2, 2, w - 4, h - 4, opts(seed, { roughness: 1.2, strokeWidth: 1.8 })));
    return out;
  }, [w, pct, tone, color, seed]);
  return (
    <div ref={ref} className="relative h-3.5 w-full min-w-0">
      <svg width={w} height={h} className="absolute top-0 left-0 overflow-visible" aria-hidden>
        <Paths drawables={drawables} />
      </svg>
    </div>
  );
}

/** Linha divisória tremida. */
export function RoughRule({ seed = 11 }: { seed?: number }) {
  const [ref, { w }] = useSize<HTMLDivElement>();
  const d = useMemo(() => (w > 4 ? [gen.line(2, 3, w - 2, 3, opts(seed, { strokeWidth: 1.4, roughness: 1.8, stroke: "var(--subtle)" }))] : []), [w, seed]);
  return (
    <div ref={ref} className="relative h-1.5 w-full min-w-0" aria-hidden>
      <svg width={w} height={6} className="absolute top-0 left-0 overflow-visible">
        <Paths drawables={d} />
      </svg>
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-display text-[30px] leading-none tracking-wide text-fg">
          <span className="relative inline-block -rotate-1">
            {title}
            <ScribbleUnderline seed={seedOf(title)} />
          </span>
        </h1>
        {subtitle && <p className="mt-2.5 text-[14px] text-subtle">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

/** Rabisco verde embaixo de títulos. */
function ScribbleUnderline({ seed }: { seed: number }) {
  const [ref, { w }] = useSize<HTMLSpanElement>();
  const d = useMemo(
    () => (w > 4 ? [gen.curve([[0, 5], [w * 0.3, 2], [w * 0.65, 7], [w + 4, 3]], opts(seed, { stroke: "var(--accent)", strokeWidth: 4, roughness: 1.4 }))] : []),
    [w, seed],
  );
  return (
    <span ref={ref} className="pointer-events-none absolute -bottom-2.5 left-0 h-3 w-full" aria-hidden>
      <svg width={w + 6} height={12} className="overflow-visible">
        <Paths drawables={d} />
      </svg>
    </span>
  );
}

export function KindPill({ kind }: { kind: "income" | "expense" }) {
  return (
    <span
      className={cx(
        "wobbly inline-flex h-5.5 items-center border-2 border-ink px-1.5 text-[11px] font-bold",
        kind === "income" ? "bg-income text-[#111]" : "bg-expense text-white",
      )}
    >
      {kind === "income" ? "Receita" : "Despesa"}
    </span>
  );
}

export { INK };
