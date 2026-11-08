// Validações de formulário no cliente (feedback imediato). O backend valida novamente.

export interface TransactionFormValues {
  description: string;
  amountCents: number | null;
  categoryId: number | null;
  date: string;
}

export type FormErrors<T> = Partial<Record<keyof T, string>>;

export const MAX_AMOUNT_CENTS = 100_000_000_000;

export function validateAmount(cents: number | null): string | undefined {
  if (cents == null) return "Informe um valor válido.";
  if (cents <= 0) return "O valor deve ser maior que zero.";
  if (cents > MAX_AMOUNT_CENTS) return "Valor acima do limite permitido.";
  return undefined;
}

export function validateDate(date: string): string | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return "Informe uma data válida.";
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d || y < 1900 || y > 2200) {
    return "Informe uma data válida.";
  }
  return undefined;
}

export function validateTransactionForm(v: TransactionFormValues): FormErrors<TransactionFormValues> {
  const errors: FormErrors<TransactionFormValues> = {};
  const desc = v.description.trim();
  if (!desc) errors.description = "Informe a descrição.";
  else if (desc.length > 120) errors.description = "Máximo de 120 caracteres.";
  const amount = validateAmount(v.amountCents);
  if (amount) errors.amountCents = amount;
  if (v.categoryId == null) errors.categoryId = "Escolha uma categoria.";
  const date = validateDate(v.date);
  if (date) errors.date = date;
  return errors;
}

export const hasErrors = (e: object) => Object.keys(e).length > 0;
