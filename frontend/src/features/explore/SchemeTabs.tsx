import { useRef, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import type { SchemeTab } from "./schemeCatalog";
import { DEFAULT_SCHEME_TAB_ID } from "./schemeCatalog";
import "./SchemeDetails.css";

const TABLIST_LABEL = "Payment schemes";
const PANEL_ID = "scheme-tabs-panel";

function tabId(tabId: string) {
  return `scheme-tab-${tabId}`;
}

/**
 * WAI-ARIA tabs pattern (manual activation) for the Payment Schemes
 * catalogue. One panel whose content follows the selected tab; arrow keys
 * rove focus without changing the selection, Enter/Space (or click) activate.
 * The active tab keeps tabIndex 0 and the panel is linked back to it.
 */
export interface SchemeTabsProps {
  tabs: readonly SchemeTab[];
  /** Renders the selected tab's panel content. */
  renderPanel: (tab: SchemeTab) => ReactNode;
  /** Controlled active tab id. */
  activeId?: string;
  /** Uncontrolled fallback — defaults to USD. */
  defaultActiveId?: string;
  /** Called whenever a tab becomes active. */
  onChange?: (activeId: string) => void;
  /** Accessible name for the tablist. */
  label?: string;
}

export function SchemeTabs({
  tabs,
  renderPanel,
  activeId: controlledActiveId,
  defaultActiveId = DEFAULT_SCHEME_TAB_ID,
  onChange,
  label = TABLIST_LABEL,
}: SchemeTabsProps) {
  const [internalActiveId, setInternalActiveId] = useState(defaultActiveId);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const activeId =
    controlledActiveId === undefined ? internalActiveId : controlledActiveId;
  const activeTab = tabs.find((tab) => tab.id === activeId) ?? tabs[0];

  if (tabs.length === 0 || !activeTab) return null;

  const activeIndex = tabs.indexOf(activeTab);

  const selectTab = (tab: SchemeTab) => {
    if (controlledActiveId === undefined) setInternalActiveId(tab.id);
    onChange?.(tab.id);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      const tabElement = (e.target as HTMLElement).closest?.(
      "[data-tab-id]",
    ) as HTMLElement | null;
      if (!tabElement) return;
      e.preventDefault();
      const id = tabElement.getAttribute("data-tab-id");
      const tab = id ? tabs.find((t) => t.id === id) : undefined;
      if (tab) {
        selectTab(tab);
        tabElement.focus();
      }
      return;
    }

    // Arrow traversal is relative to the focused tab (which may differ from
    // the selected tab while roving), falling back to the selected index.
    const focusedId = (document.activeElement as HTMLElement | null)?.getAttribute("data-tab-id");
    const focusedIndex = focusedId
      ? tabs.findIndex((tab) => tab.id === focusedId)
      : -1;
    const baseIndex = focusedIndex >= 0 ? focusedIndex : activeIndex;

    let next = -1;
    if (e.key === "ArrowRight") next = (baseIndex + 1) % tabs.length;
    else if (e.key === "ArrowLeft") next = (baseIndex - 1 + tabs.length) % tabs.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = tabs.length - 1;
    if (next === -1) return;

    e.preventDefault();
    tabRefs.current[next]?.focus();
  };

  return (
    <div className="scheme-tabs">
      <div
        role="tablist"
        aria-label={label}
        className="scheme-tabs__list"
        onKeyDown={onKeyDown}
      >
        {tabs.map((tab, index) => (
          <button
            key={tab.id}
            ref={(el) => { tabRefs.current[index] = el; }}
            type="button"
            role="tab"
            id={tabId(tab.id)}
            data-tab-id={tab.id}
            aria-selected={tab.id === activeTab.id}
            aria-controls={PANEL_ID}
            tabIndex={tab.id === activeTab.id ? 0 : -1}
            className={[
              "scheme-tab",
              tab.id === activeTab.id && "scheme-tab--active",
            ].filter(Boolean).join(" ")}
            onClick={() => {
              selectTab(tab);
              tabRefs.current[index]?.focus();
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div
        role="tabpanel"
        id={PANEL_ID}
        aria-labelledby={tabId(activeTab.id)}
        className="scheme-tabs__panel"
      >
        {renderPanel(activeTab)}
      </div>
    </div>
  );
}
