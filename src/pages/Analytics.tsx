import { useState } from "react";
import { ArrowDownRight, ArrowUpRight, CircleAlert, CircleCheck, Info, Lightbulb, Minus, Repeat } from "lucide-react";
import { api } from "../lib/api";
import { periodMonthKey, periodStore } from "../lib/app-state";
import { formatDate, formatPct, monthLabel } from "../lib/format";
import { useQuery } from "../lib/store";
import { IncomeExpenseBars, ResultLine } from "../components/charts";
import { PeriodPicker } from "../components/PeriodPicker";
import { Card, CardHeader, ErrorState, Money, PageHeader, ProgressBar, Segmented, Spinner, cx } from "../components/ui";
import type { Analytics as A, Tone } from "../types";

const TONE_ICON: Record<Tone, typeof Lightbulb> = { positive: CircleCheck, negative: CircleAlert, neutral: Lightbulb };

export default function Analytics() {
  const period = periodStore.use();
  const month = periodMonthKey(period);
  const { data, error } = useQuery(() => api.analytics(month), [month]);

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Análises"
        subtitle={`Conclusões calculadas a partir das suas movimentações · ${monthLabel(month)}`}
        actions={<PeriodPicker />}
      />
      {error && <ErrorState message={error} />}
      {!data ? (
        <div className="flex h-64 items-center justify-center">
          <Spinner />
        </div>
      ) : (
        <>
          <Metrics a={data} />
          <div className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-12">
            <Card className="xl:col-span-7">
              <CardHeader title="O que seus números dizem" subtitle="Gerado apenas quando há dados suficientes" />
              <ul className="flex flex-col gap-1 px-3 pt-3 pb-3">
                {data.insights.map((i) => {
                  const Icon = TONE_ICON[i.tone];
                  return (
                    <li key={i.id} className="flex items-start gap-3 wobbly px-2 py-2">
                      <span
                        className={cx(
                          "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center wobbly",
                          i.tone === "positive" ? "border-2 border-ink bg-income text-[#111]" : i.tone === "negative" ? "border-2 border-ink bg-expense text-white" : "border-2 border-ink bg-marker text-[#111]",
                        )}
                      >
                        <Icon size={13} />
                      </span>
                      <p className="text-[13px] leading-relaxed text-fg" data-selectable>
                        {i.message}
                      </p>
                    </li>
                  );
                })}
                {data.needsMoreData.map((m) => (
                  <li key={m} className="flex items-start gap-3 wobbly px-2 py-2">
                    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center wobbly border-2 border-dashed border-ink text-subtle">
                      <Info size={13} />
                    </span>
                    <p className="text-[13px] leading-relaxed text-subtle">{m}</p>
                  </li>
                ))}
              </ul>
            </Card>
            <div className="flex min-w-0 flex-col gap-3 xl:col-span-5">
              <Card>
                <CardHeader title="Categorias que mais consomem sua renda" />
                <div className="px-5 pt-3 pb-4">
                  {data.incomeConsumers.length ? (
                    <ul className="flex flex-col gap-3">
                      {data.incomeConsumers.map((c) => (
                        <li key={c.categoryId}>
                          <div className="mb-1 flex justify-between text-[13px]">
                            <span className="text-muted">{c.name}</span>
                            <span className="tabular text-fg">{formatPct(c.shareOfIncome)} da renda</span>
                          </div>
                          <ProgressBar value={c.shareOfIncome} color={c.color} seed={c.categoryId} />
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-[13px] text-subtle">Registre receitas e despesas do mês para ver esta análise.</p>
                  )}
                </div>
              </Card>
              <Card>
                <CardHeader title="Despesas que se repetem" subtitle="Aparecem em 3 ou mais dos últimos 6 meses" />
                <div className="px-5 pt-3 pb-4">
                  {data.recurringCandidates.length ? (
                    <ul className="flex flex-col gap-2">
                      {data.recurringCandidates.map((r) => (
                        <li key={r.description} className="flex items-center gap-3 text-[13px]">
                          <Repeat size={14} className="text-subtle" />
                          <span className="min-w-0 flex-1 truncate">{r.description}</span>
                          <span className="text-xs text-subtle">{r.months} meses</span>
                          <Money cents={r.averageCents} className="w-24 text-right text-muted" />
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-[13px] text-subtle">Nenhum padrão de repetição identificado ainda.</p>
                  )}
                  {data.registeredRecurringMonthlyCents > 0 && (
                    <p className="mt-3 border-t border-line pt-3 text-xs text-subtle">
                      Contas recorrentes cadastradas: <Money cents={data.registeredRecurringMonthlyCents} className="text-muted" /> por mês
                    </p>
                  )}
                </div>
              </Card>
            </div>
          </div>
          <HistorySection month={month} />
        </>
      )}
    </div>
  );
}

function Metrics({ a }: { a: A }) {
  const change = a.expenseChangeCents;
  return (
    <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Metric label="Total gasto no mês" value={<Money cents={a.expenseCents} tone="expense" />} />
      <Metric
        label="Comparado ao mês anterior"
        value={
          change == null ? (
            <span className="text-subtle">—</span>
          ) : (
            <span className={cx("flex items-center gap-1", change > 0 ? "text-expense-soft" : change < 0 ? "text-income-soft" : "")}>
              {change > 0 ? <ArrowUpRight size={18} /> : change < 0 ? <ArrowDownRight size={18} /> : <Minus size={18} />}
              <Money cents={Math.abs(change)} />
            </span>
          )
        }
        hint={a.expenseChangePct != null ? `${change! > 0 ? "+" : ""}${formatPct(a.expenseChangePct)} nas despesas` : "Sem dados do mês anterior"}
      />
      <Metric
        label="Média mensal de despesas"
        value={a.averageExpenseCents == null ? <span className="text-subtle">—</span> : <Money cents={a.averageExpenseCents} />}
        hint={a.averageExpenseCents == null ? `Requer 3 meses com dados (${a.monthsWithData})` : `${a.monthsWithData} meses considerados`}
      />
      <Metric
        label="Taxa de economia"
        value={
          a.savingsRate == null ? (
            <span className="text-subtle">—</span>
          ) : (
            <span className={a.savingsRate >= 0 ? "text-income-soft" : "text-expense-soft"}>{formatPct(a.savingsRate)}</span>
          )
        }
        hint={a.incomeCommittedPct != null ? `${formatPct(a.incomeCommittedPct)} da receita comprometida` : "Sem receitas no mês"}
      />
      <Metric
        label="Maior despesa"
        value={a.largestExpense ? <Money cents={a.largestExpense.amountCents} /> : <span className="text-subtle">—</span>}
        hint={a.largestExpense ? `${a.largestExpense.description} · ${formatDate(a.largestExpense.date)}` : "Sem despesas no mês"}
      />
      <Metric
        label="Menor despesa"
        value={a.smallestExpense ? <Money cents={a.smallestExpense.amountCents} /> : <span className="text-subtle">—</span>}
        hint={a.smallestExpense ? `${a.smallestExpense.description} · ${formatDate(a.smallestExpense.date)}` : "Sem despesas no mês"}
      />
      <Metric
        label="Maior categoria"
        value={a.topCategory ? <span className="truncate">{a.topCategory.name}</span> : <span className="text-subtle">—</span>}
        hint={a.topCategory ? `${formatPct(a.topCategory.share)} das despesas` : undefined}
      />
      <Metric
        label="Maior crescimento"
        value={a.fastestGrowing ? <span className="truncate">{a.fastestGrowing.name}</span> : <span className="text-subtle">—</span>}
        hint={a.fastestGrowing ? `+${formatPct(a.fastestGrowing.changePct)} em relação ao mês anterior` : "Nenhum crescimento relevante"}
      />
    </section>
  );
}

function Metric({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <Card className="flex min-w-0 flex-col gap-2.5 px-4 py-4">
      <span className="text-xs font-bold text-subtle">{label}</span>
      <div className="font-display text-lg leading-none font-bold">{value}</div>
      {hint && <span className="truncate text-xs text-subtle">{hint}</span>}
    </Card>
  );
}

function HistorySection({ month }: { month: string }) {
  const [span, setSpan] = useState<"3" | "6" | "12">("6");
  const { data } = useQuery(() => api.history(month, Number(span)), [month, span]);

  return (
    <Card className="mt-3">
      <CardHeader
        title="Comparação histórica"
        subtitle={`Últimos ${span} meses até ${monthLabel(month).toLowerCase()}`}
        action={
          <Segmented
            size="sm"
            value={span}
            onChange={setSpan}
            options={[
              { value: "3", label: "3 meses" },
              { value: "6", label: "6 meses" },
              { value: "12", label: "12 meses" },
            ]}
          />
        }
      />
      {data && (
        <div className="grid grid-cols-1 gap-4 px-5 pt-4 pb-5 xl:grid-cols-12">
          <div className="min-w-0 xl:col-span-8">
            {span === "12" ? <ResultLine data={data.months} height={240} /> : <IncomeExpenseBars data={data.months} height={240} />}
          </div>
          <div className="flex min-w-0 flex-col gap-3 xl:col-span-4">
            <div className="grid grid-cols-2 gap-2">
              <Mini label="Receita média" cents={data.averageIncomeCents} tone="income" />
              <Mini label="Despesa média" cents={data.averageExpenseCents} tone="expense" />
              <Mini label="Total recebido" cents={data.totalIncomeCents} />
              <Mini label="Total gasto" cents={data.totalExpenseCents} />
            </div>
            <p className="text-xs text-subtle">
              Médias calculadas sobre {data.monthsWithData} {data.monthsWithData === 1 ? "mês" : "meses"} com movimentações.
            </p>
            <div>
              <p className="mb-2 text-xs font-bold text-muted">Maiores categorias no período</p>
              <ul className="flex flex-col gap-1.5">
                {data.categories.slice(0, 5).map((c) => (
                  <li key={c.categoryId} className="flex items-center gap-2 text-[13px]">
                    <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: c.color }} />
                    <span className="flex-1 truncate text-muted">{c.name}</span>
                    <Money cents={c.totalCents} />
                    <span className="tabular w-10 text-right text-xs text-subtle">{formatPct(c.share)}</span>
                  </li>
                ))}
                {!data.categories.length && <li className="text-[13px] text-subtle">Sem despesas no período.</li>}
              </ul>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

function Mini({ label, cents, tone }: { label: string; cents: number | null; tone?: "income" | "expense" }) {
  return (
    <div className="wobbly border-2 border-dashed border-line bg-surface-2 px-3 py-2.5">
      <p className="text-[11px] text-subtle">{label}</p>
      <p className="mt-1 text-sm font-bold">{cents == null ? <span className="text-subtle">—</span> : <Money cents={cents} tone={tone} />}</p>
    </div>
  );
}
