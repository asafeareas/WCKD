// Gráficos desenhados à mão com Rough.js (substitui o Recharts: ~9 KB em vez de ~420 KB).
import { memo, useMemo, useState, type ReactNode } from "react";
import type { Drawable } from "roughjs/bin/core";
import { formatBRL, formatBRLCompact, formatPct, monthLabel, monthShort } from "../lib/format";
import { gen, INK, opts, Paths, useSize } from "../lib/rough";
import { useHideValues } from "../lib/store";
import type { BalancePoint, CategoryTotal, MonthPoint } from "../types";
import { Money, cx } from "./ui";

const INCOME = "var(--income)";
const EXPENSE = "var(--expense)";
const ACCENT = "var(--accent)";
const LABEL = { fill: "var(--subtle)", fontSize: 12, fontFamily: "var(--font-sans)", fontWeight: 700 } as const;

/** Escala "bonita": passo redondo (1, 2, 2,5, 5 × 10^n) e máximo múltiplo do passo. */
function niceScale(raw: number, target = 4): { max: number; ticks: number[] } {
  const v = raw > 0 ? raw : 100;
  const rough = v / target;
  const exp = Math.pow(10, Math.floor(Math.log10(rough)));
  const f = rough / exp;
  const step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * exp;
  const max = Math.ceil(v / step) * step;
  const ticks: number[] = [];
  for (let t = 0; t <= max + step / 2; t += step) ticks.push(t);
  return { max, ticks };
}
function useAxisMoney() {
  const hidden = useHideValues();
  return (v: number) => (hidden ? "✱✱✱" : formatBRLCompact(v));
}

function Tooltip({ x, y, width, children }: { x: number; y: number; width: number; children: ReactNode }) {
  const left = Math.min(Math.max(x + 14, 4), Math.max(4, width - 200));
  return (
    <div
      className="sketch pointer-events-none absolute z-10 min-w-44 bg-surface px-3 py-2 text-[13px] animate-fade-in"
      style={{ left, top: Math.max(0, y - 10) }}
    >
      {children}
    </div>
  );
}

function TipRow({ color, label, cents }: { color: string; label: string; cents: number | null }) {
  return (
    <div className="flex items-center justify-between gap-4 py-0.5">
      <span className="flex items-center gap-1.5 text-muted">
        <span className="inline-block h-3 w-3 border-2 border-ink" style={{ background: color }} />
        {label}
      </span>
      {cents == null ? <span className="text-subtle">—</span> : <Money cents={cents} />}
    </div>
  );
}

/** Eixo Y com valores e linhas-guia tracejadas. */
function YAxis({ ticks, y, left, right, fmt }: { ticks: number[]; y: (v: number) => number; left: number; right: number; fmt: (v: number) => string }) {
  return (
    <g>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={left} x2={right} y1={y(t)} y2={y(t)} style={{ stroke: "var(--rule)", strokeWidth: 1.5, strokeDasharray: "2 6", strokeLinecap: "round" }} />
          <text x={left - 8} y={y(t) + 4} textAnchor="end" style={LABEL}>
            {fmt(t)}
          </text>
        </g>
      ))}
    </g>
  );
}

// ---------- Pizza (donut) de despesas por categoria ----------

export const CategoryDonut = memo(function CategoryDonut({ data }: { data: CategoryTotal[] }) {
  const [active, setActive] = useState<number | null>(null);
  const hidden = useHideValues();
  const total = data.reduce((s, d) => s + d.totalCents, 0);
  const size = 196;
  const c = size / 2;

  const angles = useMemo(() => {
    let a = -Math.PI / 2;
    return data.map((d) => {
      const start = a;
      a += (d.totalCents / Math.max(1, total)) * Math.PI * 2;
      return [start, a] as const;
    });
  }, [data, total]);

  const slices = useMemo(
    () =>
      data.map((d, i) => {
        const [s, e] = angles[i];
        const full = data.length === 1;
        return full
          ? gen.circle(c, c, size - 12, opts(i + 21, { fill: d.color, fillStyle: active === i ? "cross-hatch" : "hachure", hachureGap: 5, fillWeight: 2.2 }))
          : gen.arc(c, c, size - 12, size - 12, s, e, true, opts(i + 21, { fill: d.color, fillStyle: active === i ? "cross-hatch" : "hachure", hachureGap: 5, fillWeight: 2.2, hachureAngle: -41 + i * 23 }));
      }),
    [data, angles, active, c],
  );
  const hole = useMemo(() => [gen.circle(c, c, size * 0.5, opts(99, { fill: "var(--surface)", fillStyle: "solid" }))], [c]);

  function onMove(e: React.MouseEvent<SVGSVGElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - r.left - c;
    const y = e.clientY - r.top - c;
    const dist = Math.hypot(x, y);
    if (dist < size * 0.25 || dist > c) return setActive(null);
    let ang = Math.atan2(y, x);
    if (ang < -Math.PI / 2) ang += Math.PI * 2;
    const i = angles.findIndex(([s, e2]) => ang >= s && ang < e2);
    setActive(i >= 0 ? i : null);
  }

  const focus = active != null ? data[active] : null;

  return (
    <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-3">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} onMouseMove={onMove} onMouseLeave={() => setActive(null)} className="overflow-visible">
          <Paths drawables={slices} />
          <Paths drawables={hole} />
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="max-w-24 truncate text-xs font-bold text-subtle">{focus ? focus.name : "Total"}</span>
          <span className="tabular text-[15px] font-bold text-fg">{hidden ? "✱✱✱✱" : formatBRL(focus ? focus.totalCents : total)}</span>
          {focus && <span className="marker tabular px-1 text-xs font-bold">{formatPct(focus.share)}</span>}
        </div>
      </div>
      <ul className="flex min-w-[210px] flex-1 flex-col gap-0.5">
        {data.slice(0, 8).map((d, i) => (
          <li
            key={d.categoryId}
            onMouseEnter={() => setActive(i)}
            onMouseLeave={() => setActive(null)}
            className={cx("wobbly grid grid-cols-[auto_1fr_auto_auto] items-center gap-2 px-1.5 py-1 text-[14px]", active === i && "bg-marker text-[#111]")}
          >
            <span className="h-3.5 w-3.5 border-2 border-ink" style={{ backgroundColor: d.color, borderRadius: "40% 10% 45% 15%" }} />
            <span className={cx("truncate", active === i ? "font-bold" : "text-muted")}>{d.name}</span>
            <Money cents={d.totalCents} className="text-[13px]" />
            <span className="tabular w-11 text-right text-xs font-bold opacity-70">{formatPct(d.share)}</span>
          </li>
        ))}
        {data.length > 8 && <li className="px-1.5 pt-1 text-xs text-subtle">+ {data.length - 8} categorias menores</li>}
      </ul>
    </div>
  );
});

// ---------- Barras: receitas x despesas ----------

export const IncomeExpenseBars = memo(function IncomeExpenseBars({ data, height = 230 }: { data: MonthPoint[]; height?: number }) {
  const [ref, { w }] = useSize<HTMLDivElement>();
  const [hover, setHover] = useState<{ i: number; x: number; y: number } | null>(null);
  const axis = useAxisMoney();
  const m = { l: 64, r: 8, t: 10, b: 26 };
  const { max, ticks } = niceScale(Math.max(...data.flatMap((d) => [d.incomeCents, d.expenseCents]), 0));
  const innerW = Math.max(0, w - m.l - m.r);
  const innerH = height - m.t - m.b;
  const y = (v: number) => m.t + innerH - (v / max) * innerH;
  const band = innerW / Math.max(1, data.length);
  const barW = Math.min(26, band * 0.3);

  const drawables = useMemo(() => {
    if (w < 50) return [];
    const out: Drawable[] = [gen.line(m.l, y(0), w - m.r, y(0), opts(5, { strokeWidth: 2.2 }))];
    data.forEach((d, i) => {
      const x0 = m.l + band * i + band / 2 - barW - 2;
      const bars: [number, string, number][] = [
        [d.incomeCents, INCOME, 0],
        [d.expenseCents, EXPENSE, barW + 4],
      ];
      bars.forEach(([v, color, dx], k) => {
        if (v <= 0) return;
        const top = y(v);
        out.push(
          gen.rectangle(x0 + dx, top, barW, y(0) - top, opts(100 + i * 2 + k, { fill: color, fillStyle: hover?.i === i ? "cross-hatch" : "hachure", hachureGap: 4, fillWeight: 2, roughness: 1.3 })),
        );
      });
    });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, w, max, hover?.i]);

  const d = hover ? data[hover.i] : null;
  return (
    <div ref={ref} className="relative w-full min-w-0" style={{ height }}>
      {w > 0 && (
        <svg width={w} height={height} className="absolute top-0 left-0 overflow-visible" onMouseLeave={() => setHover(null)}>
          <YAxis ticks={ticks} y={y} left={m.l} right={w - m.r} fmt={axis} />
          <Paths drawables={drawables} />
          {data.map((p, i) => (
            <g key={p.month}>
              <text x={m.l + band * i + band / 2} y={height - 6} textAnchor="middle" style={LABEL}>
                {monthShort(p.month)}
              </text>
              <rect
                x={m.l + band * i}
                y={m.t}
                width={band}
                height={innerH}
                fill="transparent"
                onMouseMove={(e) => {
                  const r = e.currentTarget.ownerSVGElement!.getBoundingClientRect();
                  setHover({ i, x: e.clientX - r.left, y: e.clientY - r.top });
                }}
              />
            </g>
          ))}
        </svg>
      )}
      {hover && d && (
        <Tooltip x={hover.x} y={hover.y} width={w}>
          <p className="mb-1 font-display text-[14px]">{monthLabel(d.month)}</p>
          <TipRow color={INCOME} label="Receitas" cents={d.incomeCents} />
          <TipRow color={EXPENSE} label="Despesas" cents={d.expenseCents} />
          <TipRow color="var(--marker)" label="Resultado" cents={d.resultCents} />
        </Tooltip>
      )}
    </div>
  );
});

// ---------- Linha: evolução do saldo ----------

interface Series {
  key: string;
  label: string;
  color: string;
  values: (number | null)[];
  area?: boolean;
}

function LineChart({ months, series, height, title }: { months: string[]; series: Series[]; height: number; title: (m: string) => string }) {
  const [ref, { w }] = useSize<HTMLDivElement>();
  const [hover, setHover] = useState<{ i: number; x: number; y: number } | null>(null);
  const axis = useAxisMoney();
  const m = { l: 64, r: 14, t: 12, b: 26 };
  const all = series.flatMap((s) => s.values.filter((v): v is number => v != null));
  const rawMax = Math.max(0, ...all);
  const rawMin = Math.min(0, ...all);
  const pos = niceScale(rawMax || 1);
  const neg = rawMin < 0 ? niceScale(-rawMin, 2) : null;
  const max = pos.max;
  const min = neg ? -neg.max : 0;
  const innerW = Math.max(0, w - m.l - m.r);
  const innerH = height - m.t - m.b;
  const y = (v: number) => m.t + innerH - ((v - min) / (max - min)) * innerH;
  const step = months.length > 1 ? innerW / (months.length - 1) : 0;
  const x = (i: number) => m.l + step * i;
  const ticks = [...(neg ? neg.ticks.slice(1).map((t) => -t).reverse() : []), ...pos.ticks];

  const drawables = useMemo(() => {
    if (w < 50) return [];
    const out: Drawable[] = [gen.line(m.l, y(0), w - m.r, y(0), opts(5, { strokeWidth: 2.2 }))];
    series.forEach((s, si) => {
      // Divide em trechos contínuos (meses sem saldo definido ficam em branco)
      let seg: [number, number][] = [];
      const segments: [number, number][][] = [];
      s.values.forEach((v, i) => {
        if (v == null) {
          if (seg.length) segments.push(seg);
          seg = [];
        } else seg.push([x(i), y(v)]);
      });
      if (seg.length) segments.push(seg);
      segments.forEach((pts, k) => {
        if (s.area && pts.length > 1) {
          out.push(
            gen.polygon([...pts, [pts[pts.length - 1][0], y(0)], [pts[0][0], y(0)]], opts(300 + si * 10 + k, { stroke: "none", fill: s.color, fillStyle: "hachure", hachureGap: 7, fillWeight: 1.2, hachureAngle: 60 })),
          );
        }
        if (pts.length > 1) out.push(gen.linearPath(pts, opts(200 + si * 10 + k, { stroke: s.color, strokeWidth: 3, roughness: 1.2 })));
        pts.forEach(([px, py], j) => out.push(gen.circle(px, py, 9, opts(400 + si * 50 + j, { fill: s.color, fillStyle: "solid", strokeWidth: 1.6, roughness: 0.8 }))));
      });
    });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [series, w, max, min]);

  return (
    <div ref={ref} className="relative w-full min-w-0" style={{ height }}>
      {w > 0 && (
        <svg width={w} height={height} className="absolute top-0 left-0 overflow-visible" onMouseLeave={() => setHover(null)}>
          <YAxis ticks={ticks} y={y} left={m.l} right={w - m.r} fmt={axis} />
          {hover && <line x1={x(hover.i)} x2={x(hover.i)} y1={m.t} y2={m.t + innerH} style={{ stroke: INK, strokeWidth: 1.5, strokeDasharray: "4 5" }} />}
          <Paths drawables={drawables} />
          {months.map((mo, i) => (
            <g key={mo}>
              {(step >= 46 || i % 2 === (months.length - 1) % 2) && (
                <text x={x(i)} y={height - 6} textAnchor="middle" style={LABEL}>
                  {monthShort(mo)}
                </text>
              )}
              <rect
                x={x(i) - step / 2}
                y={m.t}
                width={Math.max(step, 20)}
                height={innerH}
                fill="transparent"
                onMouseMove={(e) => {
                  const r = e.currentTarget.ownerSVGElement!.getBoundingClientRect();
                  setHover({ i, x: e.clientX - r.left, y: e.clientY - r.top });
                }}
              />
            </g>
          ))}
        </svg>
      )}
      {hover && (
        <Tooltip x={hover.x} y={hover.y} width={w}>
          <p className="mb-1 font-display text-[14px]">{title(months[hover.i])}</p>
          {series.map((s) => (
            <TipRow key={s.key} color={s.color} label={s.label} cents={s.values[hover.i]} />
          ))}
        </Tooltip>
      )}
    </div>
  );
}

export const BalanceArea = memo(function BalanceArea({ data, height = 230 }: { data: BalancePoint[]; height?: number }) {
  const series = useMemo<Series[]>(() => {
    const vals = data.map((d) => d.balanceCents);
    const last = [...vals].reverse().find((v) => v != null);
    return [{ key: "b", label: "Saldo", color: last != null && last < 0 ? EXPENSE : ACCENT, values: vals, area: true }];
  }, [data]);
  return <LineChart months={data.map((d) => d.month)} series={series} height={height} title={(m) => `Fim de ${monthLabel(m).toLowerCase()}`} />;
});

export const ResultLine = memo(function ResultLine({ data, height = 220 }: { data: MonthPoint[]; height?: number }) {
  const series = useMemo<Series[]>(
    () => [
      { key: "i", label: "Receitas", color: INCOME, values: data.map((d) => d.incomeCents) },
      { key: "e", label: "Despesas", color: EXPENSE, values: data.map((d) => d.expenseCents) },
    ],
    [data],
  );
  return <LineChart months={data.map((d) => d.month)} series={series} height={height} title={monthLabel} />;
});
