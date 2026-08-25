/**
 * Coss — the Relay component layer.
 *
 * shadcn-style primitives styled with Tailwind utilities against the Relay
 * token bridge (`design-system/coss-theme.css`). Tailwind source discovery is
 * scoped to this directory, so every utility the app ships lives in files
 * here; feature code consumes the components, not raw utilities.
 *
 * Components land in the directory together with the surface that adopts them
 * — the eager-shell bundle budget (scripts/check-bundle.mjs) charges every
 * utility scanned from this directory to the initial page load, so unwired
 * primitives do not wait here.
 */

export { Icon, type IconName, type IconProps } from "./icon";
export { Switch, type SwitchProps } from "./switch";
export { Card, cardClass } from "./card";
export { FieldDescription } from "./field";
import "./coss.css";
