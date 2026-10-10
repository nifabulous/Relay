/**
 * Landing page client entry. Imports only src/landing/client and the generated
 * point set (scripts/check-landing-boundary.mjs). Each enhancer does nothing
 * when its elements are missing.
 */
import "@fontsource/geist/latin-400.css";
import "@fontsource/geist/latin-500.css";
import "@fontsource/geist/latin-600.css";
import "@fontsource/geist-mono/latin-400.css";
import "@fontsource/geist-mono/latin-500.css";
import "./styles/tokens.css";
import "./styles/landing.css";
import pointsUrl from "../generated/globe-points.json?url";
import { initAnatomy } from "./anatomy";
import { initCounters } from "./counters";
import { initGlobe } from "./globe";
import { initIbanDemo } from "./iban-demo";
import { initRailTabs } from "./rails-tabs";
import { initScrollRoute } from "./scroll-route";
import { initThemeControl } from "./theme-control";

initThemeControl();
initRailTabs();
initGlobe(pointsUrl);
initScrollRoute();
initAnatomy();
initCounters();
initIbanDemo();
