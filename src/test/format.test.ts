import { describe, expect, it } from "vitest";
import { formatAmountInput, formatBRL, formatDate, formatPct, monthLabel, parseMoney } from "../lib/format";
import { buildFilter, type FilterState } from "../lib/filters";
import { validateDate, validateTransactionForm } from "../lib/validation";
import { splitInstallments } from "../pages/Installments";
import { shiftPeriod } from "../lib/app-state";

describe("parseMoney", () => {
  it.each([
    ["50", 5000],
    ["50,9", 5090],
    ["49,90", 4990],
    ["1.234,56", 123456],
    ["R$ 1.234,56", 123456],
    ["1234.56", 123456],
    ["1.234", 123400],
    ["0,01", 1],
    ["-10,00", -1000],
  ])("%s -> %d centavos", (input, cents) => {
    expect(parseMoney(input)).toBe(cents);
  });

  it.each(["", "abc", "1,234,5", "1,999", "--1"])("rejeita %s", (input) => {
    expect(parseMoney(input)).toBeNull();
  });

  it("não usa ponto flutuante (0,1 + 0,2)", () => {
    expect(parseMoney("0,10")! + parseMoney("0,20")!).toBe(30);
  });
});

describe("formatação pt-BR", () => {
  it("formata moeda", () => {
    expect(formatBRL(123456)).toBe("R$ 1.234,56");
    expect(formatBRL(-5)).toBe("-R$ 0,05");
    expect(formatAmountInput(100000000)).toBe("1.000.000,00");
  });
  it("formata datas e meses", () => {
    expect(formatDate("2026-03-05")).toBe("05/03/2026");
    expect(monthLabel("2026-12")).toBe("Dezembro de 2026");
  });
  it("formata percentuais", () => {
    expect(formatPct(23.4)).toBe("23%");
    expect(formatPct(4.54)).toBe("4,5%");
    expect(formatPct(5)).toBe("5%");
  });
});

describe("validações", () => {
  it("valida formulário de transação", () => {
    const errors = validateTransactionForm({ description: " ", amountCents: 0, categoryId: null, date: "2026-02-30" });
    expect(Object.keys(errors).sort()).toEqual(["amountCents", "categoryId", "date", "description"]);
    expect(validateTransactionForm({ description: "Mercado", amountCents: 100, categoryId: 1, date: "2026-02-28" })).toEqual({});
  });
  it("valida datas", () => {
    expect(validateDate("2024-02-29")).toBeUndefined();
    expect(validateDate("2025-02-29")).toBeDefined();
    expect(validateDate("29/02/2024")).toBeDefined();
  });
});

describe("filtros", () => {
  const base: FilterState = {
    search: "  uber ",
    kind: "all",
    categoryId: null,
    range: "month",
    year: 2024,
    month: 2,
    customStart: "",
    customEnd: "",
    sort: "date_desc",
  };
  it("respeita os limites do mês (inclusive fevereiro bissexto)", () => {
    expect(buildFilter(base)).toEqual({ sort: "date_desc", search: "uber", startDate: "2024-02-01", endDate: "2024-02-29" });
  });
  it("aplica tipo, categoria, ano e período livre", () => {
    expect(buildFilter({ ...base, search: "", kind: "expense", categoryId: 3, range: "year" })).toEqual({
      sort: "date_desc",
      kind: "expense",
      categoryId: 3,
      startDate: "2024-01-01",
      endDate: "2024-12-31",
    });
    expect(buildFilter({ ...base, search: "", range: "all" })).toEqual({ sort: "date_desc" });
    expect(buildFilter({ ...base, search: "", range: "custom", customStart: "2024-01-10" })).toEqual({ sort: "date_desc", startDate: "2024-01-10" });
  });
});

describe("período", () => {
  it("navega na virada do ano", () => {
    expect(shiftPeriod({ mode: "month", year: 2026, month: 1 }, -1)).toEqual({ mode: "month", year: 2025, month: 12 });
    expect(shiftPeriod({ mode: "month", year: 2025, month: 12 }, 1)).toEqual({ mode: "month", year: 2026, month: 1 });
    expect(shiftPeriod({ mode: "year", year: 2025, month: 6 }, 1)).toEqual({ mode: "year", year: 2026, month: 6 });
  });
});

describe("parcelas", () => {
  it("soma exatamente o total", () => {
    expect(splitInstallments(120000, 6)).toEqual([20000, 20000, 20000, 20000, 20000, 20000]);
    expect(splitInstallments(10000, 3)).toEqual([3334, 3333, 3333]);
    expect(splitInstallments(99999, 12).reduce((a, b) => a + b, 0)).toBe(99999);
  });
});
