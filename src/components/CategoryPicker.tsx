import type { Category } from "../types";
import { CategoryIcon, inkOn } from "./Icon";
import { cx } from "./ui";

/** Grade de categorias para seleção rápida com um clique. */
export function CategoryPicker({
  categories,
  value,
  onChange,
  invalid,
}: {
  categories: Category[];
  value: number | null;
  onChange: (id: number) => void;
  invalid?: boolean;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Categoria"
      aria-invalid={invalid || undefined}
      className={cx("grid grid-cols-3 gap-1.5", invalid && "wobbly outline-2 outline-offset-4 outline-expense outline-dashed")}
    >
      {categories.map((c, i) => {
        const active = c.id === value;
        return (
          <button
            key={c.id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(c.id)}
            className={cx(
              "flex h-9 items-center gap-2 border-2 px-2.5 text-left text-[13px] font-bold transition-transform",
              i % 2 ? "wobbly" : "wobbly-2",
              active ? "-rotate-1 border-ink shadow-[2px_2px_0_var(--ink)]" : "border-line text-muted hover:border-ink hover:text-fg",
            )}
            style={active ? { backgroundColor: c.color, color: inkOn(c.color) } : undefined}
          >
            <span style={active ? undefined : { color: c.color }} className="shrink-0">
              <CategoryIcon name={c.icon} size={16} />
            </span>
            <span className="truncate">{c.name}</span>
          </button>
        );
      })}
    </div>
  );
}
