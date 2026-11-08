// Estado global mínimo, sem bibliotecas: uma "revisão" de dados que é incrementada após
// qualquer alteração, fazendo as consultas da tela atual recarregarem automaticamente.
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { errorMessage } from "./api";

type Listener = () => void;

function createStore<T>(initial: T) {
  let value = initial;
  const listeners = new Set<Listener>();
  return {
    get: () => value,
    set: (next: T) => {
      if (Object.is(next, value)) return;
      value = next;
      listeners.forEach((l) => l());
    },
    subscribe: (l: Listener) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
  };
}

const revision = createStore(0);
export const privacy = createStore(false);

// ---------- Tema (claro padrão, escuro opcional) ----------

export type ThemeName = "light" | "dark";
const THEME_KEY = "wckd-theme";

function readCachedTheme(): ThemeName {
  try {
    return localStorage.getItem(THEME_KEY) === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

export const theme = createStore<ThemeName>(readCachedTheme());

/** Aplica o tema no documento. O cache local evita "piscar" o tema errado ao abrir o app;
 *  a preferência oficial fica salva no banco (Configurações). */
export function applyTheme(t: ThemeName) {
  theme.set(t);
  document.documentElement.classList.toggle("dark", t === "dark");
  try {
    localStorage.setItem(THEME_KEY, t);
  } catch {
    /* armazenamento indisponível: segue só com o banco */
  }
}

export function useTheme() {
  return useSyncExternalStore(theme.subscribe, theme.get);
}

/** Invalida todos os dados carregados (chamar após criar, editar ou excluir). */
export function invalidate() {
  revision.set(revision.get() + 1);
}

export function useRevision() {
  return useSyncExternalStore(revision.subscribe, revision.get);
}

export function useHideValues() {
  return useSyncExternalStore(privacy.subscribe, privacy.get);
}

export interface QueryState<T> {
  data: T | undefined;
  error: string | null;
  loading: boolean;
}

/**
 * Carrega dados do backend e recarrega quando `deps` ou a revisão global mudam.
 * Mantém os dados anteriores durante o recarregamento para evitar "piscadas" na interface.
 */
export function useQuery<T>(fn: () => Promise<T>, deps: unknown[]): QueryState<T> {
  const rev = useRevision();
  const [state, setState] = useState<QueryState<T>>({ data: undefined, error: null, loading: true });
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    let alive = true;
    setState((s) => (s.loading ? s : { ...s, loading: true }));
    fnRef
      .current()
      .then((data) => alive && setState({ data, error: null, loading: false }))
      .catch((e) => alive && setState((s) => ({ ...s, error: errorMessage(e), loading: false })));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rev, ...deps]);

  return state;
}

// ---------- Notificações (toasts) ----------

export interface Toast {
  id: number;
  tone: "success" | "error";
  message: string;
}

const toasts = createStore<Toast[]>([]);
let toastId = 0;

export function toast(message: string, tone: Toast["tone"] = "success") {
  const id = ++toastId;
  toasts.set([...toasts.get(), { id, tone, message }]);
  setTimeout(() => toasts.set(toasts.get().filter((t) => t.id !== id)), tone === "error" ? 6000 : 3200);
}

export function dismissToast(id: number) {
  toasts.set(toasts.get().filter((t) => t.id !== id));
}

export function useToasts() {
  return useSyncExternalStore(toasts.subscribe, toasts.get);
}

/** Executa uma alteração, invalida os dados e mostra o feedback. Retorna o resultado ou `undefined` em erro. */
export async function mutate<T>(action: () => Promise<T>, success?: string): Promise<T | undefined> {
  try {
    const result = await action();
    invalidate();
    if (success) toast(success);
    return result;
  } catch (e) {
    toast(errorMessage(e), "error");
    return undefined;
  }
}

/** Hook para estado "enviando" em formulários. */
export function useSubmitting() {
  const [busy, setBusy] = useState(false);
  const run = useCallback(async <T,>(fn: () => Promise<T>) => {
    setBusy(true);
    try {
      return await fn();
    } finally {
      setBusy(false);
    }
  }, []);
  return [busy, run] as const;
}
