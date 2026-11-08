import { forwardRef, useEffect, useState } from "react";
import { formatAmountInput, parseMoney } from "../lib/format";
import { cx } from "./ui";

/**
 * Campo monetário em R$. Aceita digitação livre ("50", "49,90", "1.234,56") e formata ao sair.
 * `value`/`onChange` trabalham em centavos (null = vazio ou inválido).
 */
export const MoneyInput = forwardRef<
  HTMLInputElement,
  {
    value: number | null;
    onChange: (cents: number | null) => void;
    id?: string;
    invalid?: boolean;
    large?: boolean;
    allowNegative?: boolean;
    placeholder?: string;
  }
>(function MoneyInput({ value, onChange, id, invalid, large, allowNegative, placeholder = "0,00" }, ref) {
  const [text, setText] = useState(value != null ? formatAmountInput(value) : "");

  // Sincroniza quando o valor muda externamente (ex.: abrir edição)
  useEffect(() => {
    const parsed = parseMoney(text);
    if (parsed !== value) setText(value != null ? formatAmountInput(value) : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <div className="relative">
      <span
        className={cx(
          "pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-subtle",
          large ? "text-base" : "text-sm",
        )}
      >
        R$
      </span>
      <input
        ref={ref}
        id={id}
        inputMode="decimal"
        autoComplete="off"
        placeholder={placeholder}
        aria-invalid={invalid || undefined}
        value={text}
        onChange={(e) => {
          const raw = e.target.value.replace(allowNegative ? /[^\d.,\-R$\s]/g : /[^\d.,R$\s]/g, "");
          setText(raw);
          const cents = parseMoney(raw);
          onChange(cents);
        }}
        onBlur={() => {
          const cents = parseMoney(text);
          if (cents != null) setText(formatAmountInput(cents));
        }}
        className={cx("field tabular", large ? "h-12 pl-11 text-xl font-bold" : "pl-10")}
      />
    </div>
  );
});
