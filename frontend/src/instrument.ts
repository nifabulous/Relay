import { initFrontendSentry } from "./observability";

// This sidecar must be imported before React mounts so global errors and the
// initial page-load transaction are captured.
initFrontendSentry();
