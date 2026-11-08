// Formatação pt-BR. Exibição apenas: cálculos financeiros são feitos no backend em centavos.

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const brlCompact = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  notation: "compact",
  maximumFractionDigits: 1,
});

export const MONTHS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];
const SHORT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** 123456 -> "R$ 1.234,56" (espaço comum, não NBSP) */
export function formatBRL(cents: number): string {
  return brl.format(cents / 100).replace(/ /g, " ");
}

export function formatBRLCompact(cents: number): string {
  return brlCompact.format(cents / 100).replace(/ /g, " ");
}

/** 123456 -> "1.234,56" (para campos de edição) */
export function formatAmountInput(cents: number): string {
  const abs = Math.abs(cents);
  const int = Math.floor(abs / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${cents < 0 ? "-" : ""}${int},${(abs % 100).toString().padStart(2, "0")}`;
}

/**
 * Converte texto digitado em centavos, sem ponto flutuante.
 * Aceita "50", "50,9", "1.234,56", "R$ 1.234,56" e "1234.56".
 * Retorna null se inválido.
 */
export function parseMoney(input: string): number | null {
  let s = input.replace(/R\$/gi, "").replace(/[\s ]/g, "");
  if (!s) return null;
  const negative = s.startsWith("-");
  if (negative) s = s.slice(1);
  if (s.includes(",")) {
    s = s.replace(/\./g, "");
  } else if (/^\d+\.\d{1,2}$/.test(s)) {
    s = s.replace(".", ",");
  } else {
    s = s.replace(/\.(?=\d{3}(\D|$))/g, "");
  }
  const m = /^(\d{1,12})(?:,(\d{1,2}))?$/.exec(s);
  if (!m) return null;
  const cents = Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0"));
  return negative ? -cents : cents;
}

/** "2026-03-05" -> "05/03/2026" */
export function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return d && m && y ? `${d}/${m}/${y}` : iso;
}

/** "2026-03-05" -> "05 mar" */
export function formatDateShort(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${d} ${SHORT[Number(m) - 1] ?? ""}`;
}

/** "2026-03" -> "Março de 2026" */
export function monthLabel(ym: string): string {
  const [y, m] = ym.split("-");
  return `${MONTHS[Number(m) - 1]} de ${y}`;
}

/** "2026-03" -> "mar/26" */
export function monthShort(ym: string): string {
  const [y, m] = ym.split("-");
  return `${SHORT[Number(m) - 1]}/${y.slice(2)}`;
}

export function formatPct(value: number, digits = 1): string {
  const v = Math.abs(value) >= 10 ? value.toFixed(0) : value.toFixed(digits);
  return `${v.replace(".", ",").replace(/,0$/, "")}%`;
}

export function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

export function toISODate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function todayISO(): string {
  return toISODate(new Date());
}

export function monthKey(year: number, month: number): string {
  return `${year}-${pad(month)}`;
}

/** Último dia do mês (1–12) */
export function lastDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

export function greeting(date = new Date()): string {
  const h = date.getHours();
  if (h < 5) return "Boa noite";
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1).replace(".", ",")} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
}
