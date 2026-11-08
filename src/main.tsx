import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/comic-neue/400.css";
import "@fontsource/comic-neue/700.css";
import "@fontsource/permanent-marker/400.css";
import App from "./App";
import { applyTheme, theme } from "./lib/store";
import "./styles/index.css";

// Aplica o último tema conhecido antes do primeiro desenho da tela.
applyTheme(theme.get());

// Modo demonstração (somente em desenvolvimento, para os prints do README).
if (import.meta.env.DEV && new URLSearchParams(location.search).has("demo")) {
  const { installDemo } = await import("./dev/demo");
  installDemo();
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
