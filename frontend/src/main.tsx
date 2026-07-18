import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app-shell/App";
import { migrateLegacyProgressOnce } from "./lib/persistence/storage";
import "./design-system/global.css";

// Run one-time legacy progress migration before the app renders
migrateLegacyProgressOnce();

const root = document.getElementById("root");
if (!root) throw new Error("Root element #root not found");

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
