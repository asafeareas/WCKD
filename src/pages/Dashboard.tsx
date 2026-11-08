import { ArrowDownRight, ArrowUpRight, PiggyBank, Plus, Scale, Wallet, Inbox } from "lucide-react";
import { api } from "../lib/api";
import { navigate, openNewTransaction, periodInput, periodStore } from "../lib/app-state";
import { formatDate, formatPct, greeting } from "../lib/format";
import { useQuery } from "../lib/store";
import { BalanceArea, CategoryDonut, IncomeExpenseBars } from "../components/charts";
import { PeriodPicker } from "../components/PeriodPicker";
import { StatCard } from "../components/StatCard";
import { TransactionRow } from "../components/TransactionList";
import { Button, Card, CardHeader, EmptyState, ErrorState, Money, Spinner } from "../components/ui";

export default function Dashboard() {
  const period = periodStore.use();
  const { data, error, loading } = useQuery(() => api.dashboard(periodInput(period)), [period.mode, period.year, period.month]);
  const isYear = period.mode === "year";
  const periodWord = isYear ? "do ano" : "do mês";

  return (
    <div className="animate-fade-in">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-display text-[15px] tracking-wide text-subtle">{greeting()}!</p>
          <h1 className="mt-1 flex flex-wrap items-baseline gap-x-3 font-display text-[30px] leading-none tracking-wide">
            Saldo atual
            {data ? (
              <span className="marker -rotate-1 px-2 py-0.5 font-sans text-[28px]">
                <Money cents={data.currentBalanceCents} className={data.currentBalanceCents < 0 ? "text-[#d80000]" : "text-[#111]"} />
              </span>
            ) : (
              <span className="text-subtle">—</span>
            )}
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <PeriodPicker allowYear />
          <Button variant="primary" icon={Plus} onClick={() => openNewTransaction()}>
            Adicionar
          </Button>
        </div>
      </header>

      {error && <ErrorState message={error} />}
      {!data && loading && (
        <div className="flex h-64 items-center justify-center">
          <Spinner />
        </div>
      )}

      {data && !data.hasTransactions && (
        <Card className="mb-6">
          <EmptyState
            icon={Wallet}
            title="Bem-vindo ao WCKD"
            description="Registre sua primeira movimentação para começar. Se você já tem dinheiro guardado, configure o saldo inicial para que o saldo disponível fique correto."
            action={
              <div className="flex gap-2">
                <Button variant="primary" icon={Plus} onClick={() => openNewTransaction()}>
                  Registrar movimentação
                </Button>
                <Button onClick={() => navigate("settings")}>Configurar saldo inicial</Button>
              </div>
            }
          />
        </Card>
      )}

      {data && (
        <>
          <section className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <StatCard tilt={-0.6}
              label={data.balanceMode === "current" ? "Saldo disponível" : data.balanceMode === "past" ? "Saldo no fim do período" : "Saldo projetado"}
              icon={Wallet}
              value={data.periodBalanceCents == null ? <span className="text-subtle">—</span> : <Money cents={data.periodBalanceCents} />}
              hint={
                data.balanceMode === "current"
                  ? `Até hoje, ${formatDate(data.today)}`
                  : data.balanceMode === "projected"
                    ? "Inclui lançamentos já planejados"
                    : data.periodBalanceCents == null
                      ? "Antes da data do saldo inicial"
                      : "Acumulado até o fim do período"
              }
            />
            <StatCard tilt={0.5} label={`Receitas ${periodWord}`} icon={ArrowUpRight} tone="income" value={<Money cents={data.incomeCents} tone="income" />} />
            <StatCard tilt={-0.4} label={`Despesas ${periodWord}`} icon={ArrowDownRight} tone="expense" value={<Money cents={data.expenseCents} tone="expense" />} />
            <StatCard tilt={0.7}
              label={isYear ? "Resultado anual" : "Resultado mensal"}
              icon={Scale}
              value={<Money cents={data.resultCents} tone="auto" signed />}
              hint="Receitas − despesas do período"
            />
            <StatCard tilt={-0.5}
              label="Taxa de economia"
              icon={PiggyBank}
              tone={data.savingsRate == null ? "neutral" : data.savingsRate >= 0 ? "income" : "expense"}
              value={
                data.savingsRate == null ? (
                  <span className="text-subtle">—</span>
                ) : (
                  <span className={data.savingsRate >= 0 ? "text-income-soft" : "text-expense-soft"}>{formatPct(data.savingsRate)}</span>
                )
              }
              hint={data.savingsRate == null ? "Sem receitas no período" : "Da receita não consumida"}
            />
          </section>

          <section className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-12">
            <Card className="xl:col-span-5">
              <CardHeader title="Despesas por categoria" subtitle={isYear ? `Ano de ${period.year}` : undefined} />
              <div className="px-5 pt-3 pb-5">
                {data.expenseByCategory.length ? (
                  <CategoryDonut data={data.expenseByCategory} />
                ) : (
                  <EmptyState compact icon={Inbox} title="Nenhuma despesa no período" />
                )}
              </div>
            </Card>
            <Card className="xl:col-span-7">
              <CardHeader
                title="Receitas x despesas"
                subtitle={isYear ? "Meses do ano" : "Últimos 6 meses"}
                action={<Legend />}
              />
              <div className="px-3 pt-2 pb-3">
                <IncomeExpenseBars data={data.monthly} />
              </div>
            </Card>
          </section>

          <section className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-12">
            <Card className="xl:col-span-7">
              <CardHeader title="Evolução do saldo" subtitle="Saldo acumulado no fim de cada mês (12 meses)" />
              <div className="px-3 pt-2 pb-3">
                <BalanceArea data={data.balanceEvolution} />
              </div>
            </Card>
            <Card className="flex flex-col xl:col-span-5">
              <CardHeader
                title="Últimas movimentações"
                subtitle={isYear ? "No ano selecionado" : "No mês selecionado"}
                action={
                  <button onClick={() => navigate("transactions")} className="text-xs font-bold text-subtle hover:text-fg">
                    Ver todas
                  </button>
                }
              />
              <div className="mt-2 flex-1 pb-2">
                {data.recent.length ? (
                  data.recent.map((t) => <TransactionRow key={t.id} t={t} showKind={false} />)
                ) : (
                  <EmptyState
                    compact
                    icon={Inbox}
                    title="Sem movimentações no período"
                    action={
                      <Button size="sm" icon={Plus} onClick={() => openNewTransaction()}>
                        Adicionar
                      </Button>
                    }
                  />
                )}
              </div>
            </Card>
          </section>
        </>
      )}
    </div>
  );
}

function Legend() {
  return (
    <div className="flex items-center gap-3 text-xs text-subtle">
      <span className="flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-sm bg-income" /> Receitas
      </span>
      <span className="flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-sm bg-expense" /> Despesas
      </span>
    </div>
  );
}
