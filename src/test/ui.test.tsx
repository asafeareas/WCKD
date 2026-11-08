import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { invoke } from "@tauri-apps/api/core";
import { TransactionModal } from "../components/TransactionModal";
import { MoneyInput } from "../components/MoneyInput";
import { Toaster } from "../components/Toaster";
import { openNewTransaction, txModalStore } from "../lib/app-state";
import { invalidate, useQuery } from "../lib/store";
import type { Category } from "../types";

const mockInvoke = vi.mocked(invoke);

const categories: Category[] = [
  { id: 1, name: "Alimentação", kind: "expense", color: "#F59E0B", icon: "utensils", transactionCount: 0, linkCount: 0 },
  { id: 2, name: "Transporte", kind: "expense", color: "#3B82F6", icon: "car", transactionCount: 0, linkCount: 0 },
  { id: 3, name: "Salário", kind: "income", color: "#22C55E", icon: "briefcase", transactionCount: 0, linkCount: 0 },
];

beforeEach(() => {
  mockInvoke.mockReset();
  act(() => txModalStore.set({ open: false, editing: null, kind: "expense" }));
});

describe("MoneyInput", () => {
  it("converte o texto digitado em centavos e formata ao sair", async () => {
    const onChange = vi.fn();
    render(<MoneyInput id="m" value={null} onChange={onChange} />);
    const input = screen.getByRole("textbox");
    await userEvent.type(input, "1234,5");
    expect(onChange).toHaveBeenLastCalledWith(123450);
    await userEvent.tab();
    expect(input).toHaveValue("1.234,50");
  });
});

describe("TransactionModal", () => {
  function setup() {
    mockInvoke.mockImplementation(async (cmd: string, args?: unknown) => {
      if (cmd === "list_categories") return categories;
      if (cmd === "create_transaction") return { id: 10, ...(args as { input: object }).input };
      throw new Error(`command inesperada: ${cmd}`);
    });
    render(
      <>
        <TransactionModal />
        <Toaster />
      </>,
    );
    act(() => openNewTransaction());
  }

  it("mostra erros de validação e não envia dados inválidos", async () => {
    setup();
    await userEvent.click(await screen.findByRole("button", { name: "Salvar" }));
    expect(await screen.findByText(/Informe a descrição\./)).toBeInTheDocument();
    expect(screen.getByText(/Informe um valor válido\./)).toBeInTheDocument();
    expect(screen.getByText(/Escolha uma categoria\./)).toBeInTheDocument();
    expect(mockInvoke).not.toHaveBeenCalledWith("create_transaction", expect.anything());
  });

  it("registra uma despesa com descrição, valor, categoria e data", async () => {
    setup();
    await userEvent.type(await screen.findByLabelText("Descrição"), "Mercado");
    await userEvent.type(screen.getByLabelText("Valor"), "87,40");
    await userEvent.click(await screen.findByRole("radio", { name: /Alimentação/ }));
    await userEvent.click(screen.getByRole("button", { name: "Salvar" }));

    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith("create_transaction", {
        input: expect.objectContaining({ description: "Mercado", amountCents: 8740, kind: "expense", categoryId: 1, notes: null }),
      }),
    );
    expect(await screen.findByText("Despesa registrada.")).toBeInTheDocument();
    await waitFor(() => expect(txModalStore.get().open).toBe(false));
  });

  it("mostra apenas categorias do tipo selecionado", async () => {
    setup();
    expect(await screen.findByRole("radio", { name: /Alimentação/ })).toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: /Salário/ })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("radio", { name: "Receita" }));
    expect(await screen.findByRole("radio", { name: /Salário/ })).toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: /Alimentação/ })).not.toBeInTheDocument();
  });
});

describe("useQuery", () => {
  function Probe({ fn }: { fn: () => Promise<number> }) {
    const q = useQuery(fn, []);
    if (q.error) return <p>erro: {q.error}</p>;
    return <p>{q.loading && q.data === undefined ? "carregando" : `valor ${q.data}`}</p>;
  }

  it("mostra carregamento, dados e recarrega após invalidação", async () => {
    let n = 0;
    const fn = vi.fn(async () => ++n);
    render(<Probe fn={fn} />);
    expect(screen.getByText("carregando")).toBeInTheDocument();
    expect(await screen.findByText("valor 1")).toBeInTheDocument();
    act(() => invalidate());
    expect(await screen.findByText("valor 2")).toBeInTheDocument();
  });

  it("exibe a mensagem de erro do backend", async () => {
    render(<Probe fn={() => Promise.reject({ kind: "validation", message: "Mês inválido." })} />);
    expect(await screen.findByText("erro: Mês inválido.")).toBeInTheDocument();
  });
});
