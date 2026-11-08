// Desenho "à mão" com Rough.js. Usamos só o gerador (sem tocar no DOM): ele devolve caminhos SVG
// que o React renderiza normalmente. Cores são variáveis CSS, então trocar o tema não exige redesenhar.
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import rough from "roughjs";
import type { Drawable, Options } from "roughjs/bin/core";

export const gen = rough.generator();

export const INK = "var(--ink)";

/** Opções base: traço tremido de mouse no Paint. `seed` fixo = desenho estável entre renderizações. */
export function opts(seed: number, extra: Options = {}): Options {
  return { roughness: 1.6, bowing: 1.4, stroke: INK, strokeWidth: 2, seed: Math.max(1, Math.round(seed)), ...extra };
}

/** Semente estável a partir de um texto (ex.: id do item). */
export function seedOf(text: string | number): number {
  const s = String(text);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (Math.abs(h) % 2_000_000) + 1;
}

export function Paths({ drawables, className, style }: { drawables: Drawable[]; className?: string; style?: CSSProperties }) {
  return (
    <g className={className} style={style}>
      {drawables.flatMap((d, i) =>
        gen.toPaths(d).map((p, j) => (
          <path
            key={`${i}-${j}`}
            d={p.d}
            style={{
              stroke: p.stroke === "none" ? "none" : p.stroke,
              strokeWidth: p.strokeWidth,
              fill: p.fill ?? "none",
              strokeLinecap: "round",
              strokeLinejoin: "round",
            }}
          />
        )),
      )}
    </g>
  );
}

/** Mede o tamanho de um elemento (ResizeObserver). */
export function useSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const r = el.getBoundingClientRect();
      setSize((s) => (Math.abs(s.w - r.width) < 1 && Math.abs(s.h - r.height) < 1 ? s : { w: r.width, h: r.height }));
    };
    update();
    // Fontes carregam depois do primeiro desenho e mudam o tamanho do texto.
    document.fonts?.ready.then(update).catch(() => {});
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size] as const;
}

let autoSeed = 7;

/**
 * Contorno rabiscado que preenche o elemento pai (que deve ser `relative`).
 * `shadow` desenha uma sombra hachurada deslocada, estilo quadrinho.
 */
export const RoughFrame = memo(function RoughFrame({
  seed,
  shadow = false,
  fill,
  strokeWidth = 2,
  roughness,
}: {
  seed?: number;
  shadow?: boolean;
  fill?: string;
  strokeWidth?: number;
  roughness?: number;
}) {
  const ref = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const stable = useMemo(() => seed ?? (autoSeed = (autoSeed * 48271) % 2147483647), [seed]);

  useEffect(() => {
    const el = ref.current?.parentElement;
    if (!el) return;
    const update = () => {
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      setSize((s) => (s.w === w && s.h === h ? s : { w, h }));
    };
    update();
    document.fonts?.ready.then(update).catch(() => {});
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const drawables = useMemo(() => {
    const { w, h } = size;
    if (w < 8 || h < 8) return [];
    const r = roughness ?? (Math.max(w, h) > 500 ? 1.1 : 1.4);
    const out: Drawable[] = [];
    if (shadow) {
      out.push(
        gen.rectangle(6, 6, w - 7, h - 7, opts(stable + 1, { roughness: r, stroke: "none", fill: INK, fillStyle: "hachure", hachureGap: 4.5, fillWeight: 1.2 })),
      );
    }
    out.push(
      gen.rectangle(2, 2, w - (shadow ? 8 : 4), h - (shadow ? 8 : 4), opts(stable, { roughness: r, strokeWidth, fill: fill ?? "var(--surface)", fillStyle: "solid" })),
    );
    return out;
  }, [size, stable, shadow, fill, strokeWidth, roughness]);

  return (
    <svg ref={ref} aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-visible" width={size.w} height={size.h}>
      <Paths drawables={drawables} />
    </svg>
  );
});
