import {
  ArrowLeftRight, CalendarClock, CreditCard, Eye, EyeOff, LayoutDashboard, LineChart, Moon, Plus, Settings, Shapes, Sun, Target,
  type LucideIcon,
} from "lucide-react";
import { useMemo } from "react";
import { navigate, openNewTransaction, pageStore, type Page } from "../lib/app-state";
import { api } from "../lib/api";
import { gen, opts, Paths, useSize } from "../lib/rough";
import { applyTheme, mutate, privacy, useHideValues, useTheme } from "../lib/store";
import { cx } from "./ui";
import logo from "../assets/logo.png";

const NAV: { page: Page; label: string; icon: LucideIcon; group?: string }[] = [
  { page: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { page: "transactions", label: "Transações", icon: ArrowLeftRight },
  { page: "analytics", label: "Análises", icon: LineChart },
  { page: "budgets", label: "Orçamentos", icon: Target, group: "Planejamento" },
  { page: "recurring", label: "Contas recorrentes", icon: CalendarClock },
  { page: "installments", label: "Parcelamentos", icon: CreditCard },
  { page: "categories", label: "Categorias", icon: Shapes, group: "Sistema" },
  { page: "settings", label: "Configurações", icon: Settings },
];

/** Salva uma preferência visual no banco, mantendo as demais configurações. */
async function savePref(patch: { hideValues?: boolean; theme?: "light" | "dark" }) {
  await mutate(async () => {
    const s = await api.getSettings();
    return api.saveSettings({ ...s, ...patch });
  });
}

export function Sidebar() {
  const current = pageStore.use();
  const hidden = useHideValues();
  const theme = useTheme();
  const [ref, { h }] = useSize<HTMLElement>();
  const border = useMemo(() => (h > 10 ? [gen.line(2, 4, 3, h - 4, opts(77, { strokeWidth: 2.4, roughness: 2 }))] : []), [h]);

  return (
    <aside ref={ref} className="relative flex w-56 shrink-0 flex-col overflow-y-auto bg-surface-2 px-3 py-3">
      <svg className="pointer-events-none absolute top-0 right-0 h-full w-2 overflow-visible" aria-hidden>
        <Paths drawables={border} />
      </svg>

      <div className="mb-3 flex items-center gap-2 px-1">
        <img src={logo} alt="" className="h-12 w-12 -rotate-6 object-contain drop-shadow-[2px_2px_0_var(--ink)]" draggable={false} />
        <span className="font-display text-[26px] leading-none tracking-wider text-fg">WCKD</span>
      </div>

      <button
        onClick={() => openNewTransaction()}
        title="Atalho: Ctrl+N"
        className="sketch mb-4 flex h-10 -rotate-1 items-center justify-center bg-accent px-3 text-[14px] font-bold text-[#111] transition-transform hover:rotate-0 hover:shadow-[3px_4px_0_var(--ink)] active:translate-y-0.5 active:shadow-none"
      >
        <span className="flex items-center gap-1.5">
          <Plus size={17} strokeWidth={3} /> Nova movimentação
        </span>
        
      </button>

      <nav className="flex flex-1 flex-col gap-0.5">
        {NAV.map((item) => {
          const active = current === item.page;
          return (
            <div key={item.page}>
              {item.group && <p className="mt-3 mb-1 px-2 font-display text-[12px] tracking-widest text-subtle">{item.group}</p>}
              <button
                onClick={() => navigate(item.page)}
                aria-current={active ? "page" : undefined}
                className={cx(
                  "wobbly flex h-8.5 w-full items-center gap-2.5 px-2.5 text-[14px] font-bold transition-colors",
                  active ? "marker -rotate-1 text-[#111]" : "text-muted hover:bg-surface-3 hover:text-fg",
                )}
              >
                <item.icon size={17} strokeWidth={2.4} />
                {item.label}
              </button>
            </div>
          );
        })}
      </nav>

      <div className="mt-3 flex flex-col gap-0.5 border-t-2 border-dashed border-line pt-2">
        <button
          onClick={() => {
            const next = theme === "dark" ? "light" : "dark";
            applyTheme(next);
            void savePref({ theme: next });
          }}
          className="wobbly flex h-8 items-center gap-2.5 px-2.5 text-[13px] font-bold text-subtle transition-colors hover:bg-surface-3 hover:text-fg"
        >
          {theme === "dark" ? <Sun size={16} strokeWidth={2.4} /> : <Moon size={16} strokeWidth={2.4} />}
          {theme === "dark" ? "Tema claro" : "Tema escuro"}
        </button>
        <button
          onClick={() => {
            privacy.set(!hidden);
            void savePref({ hideValues: !hidden });
          }}
          className="wobbly flex h-8 items-center gap-2.5 px-2.5 text-[13px] font-bold text-subtle transition-colors hover:bg-surface-3 hover:text-fg"
          title="Ocultar ou mostrar valores na tela"
        >
          {hidden ? <EyeOff size={16} strokeWidth={2.4} /> : <Eye size={16} strokeWidth={2.4} />}
          {hidden ? "Mostrar valores" : "Ocultar valores"}
        </button>
      </div>
    </aside>
  );
}
