import { lazy, Suspense, useEffect } from "react";
import { Sidebar } from "./components/Sidebar";
import { TransactionModal } from "./components/TransactionModal";
import { ConfirmHost, isModalOpen } from "./components/Modal";
import { Toaster } from "./components/Toaster";
import { Spinner } from "./components/ui";
import { openNewTransaction, pageStore, type Page } from "./lib/app-state";
import { api } from "./lib/api";
import { applyTheme, privacy } from "./lib/store";
import Dashboard from "./pages/Dashboard";

// O Dashboard é a tela inicial e entra no bundle principal; as demais carregam sob demanda.
const PAGES: Record<Exclude<Page, "dashboard">, React.LazyExoticComponent<() => React.JSX.Element>> = {
  transactions: lazy(() => import("./pages/Transactions")),
  analytics: lazy(() => import("./pages/Analytics")),
  budgets: lazy(() => import("./pages/Budgets")),
  recurring: lazy(() => import("./pages/Recurring")),
  installments: lazy(() => import("./pages/Installments")),
  categories: lazy(() => import("./pages/Categories")),
  settings: lazy(() => import("./pages/Settings")),
};

export default function App() {
  const page = pageStore.use();

  useEffect(() => {
    api.getSettings().then((s) => { privacy.set(s.hideValues); applyTheme(s.theme); }).catch(() => {});

    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "n" && !isModalOpen()) {
        e.preventDefault();
        openNewTransaction();
      }
    };
    // Bloqueia o menu de contexto padrão do navegador (exceto em campos de texto)
    const onContext = (e: MouseEvent) => {
      const el = e.target as HTMLElement;
      if (!el.closest("input, textarea")) e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("contextmenu", onContext);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("contextmenu", onContext);
    };
  }, []);

  const Page = page === "dashboard" ? Dashboard : PAGES[page];

  return (
    <div className="flex h-full">
      <Sidebar />
      <main className="min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[1500px] px-7 py-6">
          <Suspense
            fallback={
              <div className="flex h-64 items-center justify-center">
                <Spinner />
              </div>
            }
          >
            <Page />
          </Suspense>
        </div>
      </main>
      <TransactionModal />
      <ConfirmHost />
      <Toaster />
    </div>
  );
}
