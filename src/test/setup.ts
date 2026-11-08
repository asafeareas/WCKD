import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

afterEach(() => cleanup());

// Recharts usa ResizeObserver
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;

// Por padrão, nenhuma command é chamada nos testes; cada teste define o mock que precisa.
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
