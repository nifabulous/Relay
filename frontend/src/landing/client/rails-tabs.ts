/**
 * WAI-ARIA tabs over the pre-rendered rail panels: automatic activation, a
 * roving tabindex, Left/Right wrapping at the ends, Home and End. Without
 * JavaScript every panel stays visible; landing.css hides the tab list then.
 */
export function initRailTabs(doc: Document = document): void {
  const list = doc.getElementById("rail-tabs");
  const panels = doc.getElementById("rail-panels");
  if (!list || !panels) return;
  const tabs = Array.from(list.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
  if (tabs.length === 0) return;

  const select = (index: number, focus: boolean) => {
    tabs.forEach((tab, i) => {
      const selected = i === index;
      tab.setAttribute("aria-selected", String(selected));
      tab.tabIndex = selected ? 0 : -1;
      const panel = doc.getElementById(tab.getAttribute("aria-controls") ?? "");
      if (panel) panel.hidden = !selected;
    });
    if (focus) tabs[index].focus();
  };

  tabs.forEach((tab, index) => {
    tab.addEventListener("click", () => select(index, false));
    tab.addEventListener("keydown", (event) => {
      const last = tabs.length - 1;
      const next =
        event.key === "ArrowRight" ? (index === last ? 0 : index + 1)
        : event.key === "ArrowLeft" ? (index === 0 ? last : index - 1)
        : event.key === "Home" ? 0
        : event.key === "End" ? last
        : -1;
      if (next < 0) return;
      event.preventDefault();
      select(next, true);
    });
  });

  const initial = tabs.findIndex((tab) => tab.getAttribute("aria-selected") === "true");
  select(initial < 0 ? 0 : initial, false);
  // From here the hidden attribute, not the pre-paint CSS rule, controls the panels.
  panels.classList.add("ready");
}
