import { useEffect, useState } from "react";
import { Database, Download, FileSpreadsheet, FolderOpen, HardDriveDownload, RotateCcw, ShieldCheck } from "lucide-react";
import { api, errorMessage } from "../lib/api";
import { formatBytes, formatDate, todayISO } from "../lib/format";
import { applyTheme, invalidate, mutate, privacy, theme as themeNow, toast, useQuery, useSubmitting, useTheme, type ThemeName } from "../lib/store";
import { validateDate } from "../lib/validation";
import { confirm } from "../components/Modal";
import { MoneyInput } from "../components/MoneyInput";
import { Button, Card, CardHeader, ErrorState, Field, Input, PageHeader, Segmented, Select, Spinner } from "../components/ui";

export default function Settings() {
  const settings = useQuery(api.getSettings, []);
  const info = useQuery(api.appInfo, []);

  return (
    <div className="animate-fade-in">
      <PageHeader title="Configurações" subtitle="Saldo inicial, backup, exportação e informações do aplicativo" />
      {settings.error && <ErrorState message={settings.error} />}
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        {settings.data ? <InitialBalanceCard initial={settings.data} /> : <Card className="flex h-48 items-center justify-center"><Spinner /></Card>}
        <div className="flex flex-col gap-3">
          <AppearanceCard />
          <BackupCard />
        </div>
        <ExportCard />
        <Card>
          <CardHeader title="Aplicativo" />
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2.5 px-5 pt-4 pb-5 text-[13px]">
            <dt className="text-subtle">Versão</dt>
            <dd>{info.data?.version ?? "—"}</dd>
            <dt className="text-subtle">Versão do banco</dt>
            <dd>{info.data?.schemaVersion ?? "—"}</dd>
            <dt className="text-subtle">Formatação</dt>
            <dd>Real brasileiro (R$), datas DD/MM/AAAA, vírgula decimal</dd>
            <dt className="text-subtle">Banco de dados</dt>
            <dd className="break-all text-muted" data-selectable>
              {info.data?.databasePath ?? "—"}
            </dd>
            <dt className="text-subtle">Privacidade</dt>
            <dd className="flex items-center gap-1.5 text-muted">
              <ShieldCheck size={14} className="text-income" /> 100% offline. Nenhum dado sai do seu computador.
            </dd>
          </dl>
          <div className="border-t border-line px-5 py-3">
            <Button size="sm" icon={FolderOpen} onClick={() => mutate(api.openDataFolder)}>
              Abrir pasta de dados
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}

function AppearanceCard() {
  const current = useTheme();
  async function change(t: ThemeName) {
    applyTheme(t);
    await mutate(async () => api.saveSettings({ ...(await api.getSettings()), theme: t }));
  }
  return (
    <Card>
      <CardHeader title="Aparência" subtitle="O tema claro é o padrão. O escuro é opcional." />
      <div className="px-5 pt-3 pb-5">
        <Segmented
          value={current}
          onChange={change}
          options={[
            { value: "light", label: "☀ Claro" },
            { value: "dark", label: "☾ Escuro" },
          ]}
        />
      </div>
    </Card>
  );
}

function InitialBalanceCard({ initial }: { initial: Awaited<ReturnType<typeof api.getSettings>> }) {
  const [amount, setAmount] = useState<number | null>(initial.initialBalanceCents);
  const [date, setDate] = useState(initial.initialBalanceDate ?? "");
  const [hide, setHide] = useState(initial.hideValues);
  const [err, setErr] = useState<{ amount?: string; date?: string }>({});
  const [busy, run] = useSubmitting();

  useEffect(() => {
    setAmount(initial.initialBalanceCents);
    setDate(initial.initialBalanceDate ?? "");
    setHide(initial.hideValues);
  }, [initial]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const errors: typeof err = {};
    if (amount == null) errors.amount = "Informe um valor válido (pode ser 0).";
    if (amount && !date) errors.date = "Informe a data de referência.";
    if (date && validateDate(date)) errors.date = validateDate(date);
    setErr(errors);
    if (Object.keys(errors).length) return;
    const ok = await run(() =>
      mutate(
        () => api.saveSettings({ initialBalanceCents: amount ?? 0, initialBalanceDate: date || null, hideValues: hide, theme: themeNow.get() }),
        "Configurações salvas.",
      ),
    );
    if (ok) privacy.set(ok.hideValues);
  }

  return (
    <Card>
      <CardHeader title="Saldo inicial" subtitle="O dinheiro que você já possuía na data de referência. Não é contado como receita." />
      <form onSubmit={save} className="flex flex-col gap-4 px-5 pt-4 pb-5" noValidate>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Saldo inicial" htmlFor="ib-amount" error={err.amount}>
            <MoneyInput id="ib-amount" allowNegative value={amount} onChange={setAmount} invalid={!!err.amount} />
          </Field>
          <Field label="Data de referência" htmlFor="ib-date" error={err.date}>
            <Input id="ib-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-invalid={!!err.date || undefined} />
          </Field>
        </div>
        <p className="text-xs leading-relaxed text-subtle">
          Saldo disponível = saldo inicial + receitas − despesas a partir da data de referência. Movimentações anteriores a essa data
          continuam nos relatórios mensais, mas não alteram o saldo (evita contar duas vezes o mesmo dinheiro).
        </p>
        <label className="flex cursor-pointer items-center gap-2.5 text-[13px] text-muted">
          <input type="checkbox" checked={hide} onChange={(e) => setHide(e.target.checked)} className="h-4 w-4 accent-[#22c55e]" />
          Ocultar valores ao abrir o aplicativo (privacidade)
        </label>
        <div className="flex justify-end gap-2">
          {!date && (
            <Button variant="ghost" onClick={() => setDate(todayISO())}>
              Usar hoje como referência
            </Button>
          )}
          <Button variant="primary" type="submit" loading={busy}>
            Salvar
          </Button>
        </div>
      </form>
    </Card>
  );
}

function BackupCard() {
  const [busy, run] = useSubmitting();

  async function exportBackup() {
    const path = await run(() => mutate(api.exportBackup));
    if (path) toast("Backup salvo com sucesso.");
  }

  async function restore() {
    let info;
    try {
      info = await api.pickBackup();
    } catch (e) {
      toast(errorMessage(e), "error");
      return;
    }
    if (!info) return;
    const yes = await confirm({
      title: "Restaurar este backup?",
      confirmLabel: "Restaurar",
      message: (
        <div className="flex flex-col gap-3">
          <p>
            Todos os dados atuais serão <strong className="text-fg">substituídos</strong> pelo conteúdo do backup. Antes disso, o WCKD salva
            automaticamente uma cópia de segurança dos dados atuais.
          </p>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 wobbly border-2 border-dashed border-line bg-surface-2 p-3 text-xs">
            <dt className="text-subtle">Arquivo</dt>
            <dd className="truncate">{info.path.split(/[\\/]/).pop()}</dd>
            <dt className="text-subtle">Movimentações</dt>
            <dd>{info.transactionCount}</dd>
            <dt className="text-subtle">Categorias</dt>
            <dd>{info.categoryCount}</dd>
            <dt className="text-subtle">Período</dt>
            <dd>{info.firstDate && info.lastDate ? `${formatDate(info.firstDate)} a ${formatDate(info.lastDate)}` : "—"}</dd>
            <dt className="text-subtle">Tamanho</dt>
            <dd>{formatBytes(info.fileSizeBytes)}</dd>
          </dl>
        </div>
      ),
    });
    if (!yes) return;
    const safety = await run(() => mutate(() => api.restoreBackup(info.path)));
    if (safety) {
      toast("Backup restaurado. Uma cópia dos dados anteriores foi salva na pasta de dados.");
      const s = await api.getSettings();
      privacy.set(s.hideValues);
      applyTheme(s.theme);
      invalidate();
    }
  }

  return (
    <Card>
      <CardHeader title="Backup" subtitle="Cópia completa de todos os seus dados em um único arquivo .wckd" />
      <div className="flex flex-col gap-3 px-5 pt-4 pb-5">
        <div className="flex items-start gap-3 wobbly border-2 border-dashed border-line bg-surface-2 p-3 text-xs leading-relaxed text-muted">
          <Database size={16} className="mt-0.5 shrink-0 text-subtle" />
          O backup inclui movimentações, categorias, contas recorrentes, parcelamentos, orçamentos e configurações. Guarde-o em um pendrive
          ou outro disco para se proteger contra falhas.
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" icon={HardDriveDownload} onClick={exportBackup} disabled={busy}>
            Exportar backup
          </Button>
          <Button icon={RotateCcw} onClick={restore} disabled={busy}>
            Restaurar backup
          </Button>
        </div>
      </div>
    </Card>
  );
}

function ExportCard() {
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(thisYear);
  const [busy, run] = useSubmitting();

  async function go(fn: () => Promise<string | null>, label: string) {
    const path = await run(() => mutate(fn));
    if (path) toast(`${label} exportado.`);
  }

  return (
    <Card>
      <CardHeader title="Exportar relatórios" subtitle="Arquivos CSV compatíveis com Excel e Google Planilhas" />
      <div className="flex flex-col gap-3 px-5 pt-4 pb-5">
        <Field label="Ano">
          <Select value={year} onChange={(e) => setYear(Number(e.target.value))} className="w-32">
            {Array.from({ length: 10 }, (_, i) => thisYear + 1 - i).map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </Select>
        </Field>
        <div className="flex flex-wrap gap-2">
          <Button icon={FileSpreadsheet} disabled={busy} onClick={() => go(() => api.exportMonthlySummaryCsv(year), "Resumo mensal")}>
            Resumo mensal
          </Button>
          <Button icon={FileSpreadsheet} disabled={busy} onClick={() => go(() => api.exportCategoryReportCsv(year), "Relatório por categoria")}>
            Relatório por categoria
          </Button>
          <Button
            icon={Download}
            disabled={busy}
            onClick={() => go(() => api.exportTransactionsCsv({ startDate: `${year}-01-01`, endDate: `${year}-12-31` }), "Transações do ano")}
          >
            Transações do ano
          </Button>
        </div>
      </div>
    </Card>
  );
}
