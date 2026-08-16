import "./instrument";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import * as Sentry from "@sentry/react";
import { App } from "./app-shell/App";
import { migrateLegacyProgressOnce } from "./lib/persistence/storage";
import "./design-system/global.css";

// Run one-time legacy progress migration before the app renders
migrateLegacyProgressOnce();

const root = document.getElementById("root");
if (!root) throw new Error("Root element #root not found");

createRoot(root, {
  onUncaughtError: Sentry.reactErrorHandler(),
  onCaughtError: Sentry.reactErrorHandler(),
  onRecoverableError: Sentry.reactErrorHandler(),
}).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
