import { useRef, useState } from "react";
import type { SSIRecord } from "../../api/schemas";
import type { CurrencyGroup } from "./ssiGrouping";
import { SsiProvenance } from "./SsiProvenance";

/**
 * One currency's settlement instructions as a table, styled like the app's
 * other data tables (bordered, uppercase headers, zebra rows).
 */
function SsiTable({ records }: { records: SSIRecord[] }) {
  return (
    <div className="bank-ssi__table-scroll">
      <table className="bank-ssi__table">
        <thead>
          <tr>
            <th>Correspondent</th>
            <th>BIC</th>
            <th>Nostro</th>
            <th>Credit to</th>
            <th>Charges</th>
            <th>Value date</th>
            <th>Settlement IDs</th>
            <th>Source</th>
          </tr>
        </thead>
        <tbody>
          {records.map((r, index) => {
            const settlement = r.intermediary_settlement;
            const settlementIds =
              settlement && (settlement.chips_uid || settlement.aba)
                ? [
                    settlement.chips_uid ? `CHIPS ${settlement.chips_uid}` : null,
                    settlement.aba ? `ABA ${settlement.aba}` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")
                : null;
            return (
              // The index disambiguates: /api/import/ssi can add rows, so
              // currency + intermediary BIC is not guaranteed unique even
              // though the seeded data has no collisions today.
              <tr key={`${r.intermediary_bic}-${index}`}>
                <td>{r.intermediary_bank_name ?? r.intermediary_bic}</td>
                <td className="mono">{r.intermediary_bic}</td>
                <td className="mono">{r.intermediary_account ?? "—"}</td>
                <td className="mono">{r.beneficiary_account ?? "—"}</td>
                <td className="mono">{r.charge_code}</td>
                <td>{r.value_date}</td>
                <td className="mono">{settlementIds ?? "—"}</td>
                <td>
                  <SsiProvenance status={r.status} asOf={r.as_of} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Currencies as tabs — one table at a time, in settlement-importance order.
 * Keyboard: arrow keys move between tabs and focus follows (roving tabindex).
 */
function SsiTabs({ groups }: { groups: CurrencyGroup[] }) {
  const [active, setActive] = useState(0);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  if (groups.length === 0) return null;
  const current = Math.min(active, groups.length - 1);
  const group = groups[current];

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const delta = e.key === "ArrowRight" ? 1 : -1;
    const next = (current + delta + groups.length) % groups.length;
    setActive(next);
    tabRefs.current[next]?.focus();
  };

  return (
    <div>
      <div
        className="bank-ssi__tabs"
        role="tablist"
        aria-label="Settlement currencies"
        onKeyDown={onKeyDown}
      >
        {groups.map((g, i) => (
          <button
            key={g.currency}
            ref={(el) => { tabRefs.current[i] = el; }}
            type="button"
            role="tab"
            id={`bank-ssi-tab-${g.currency}`}
            aria-selected={i === current}
            aria-controls={`bank-ssi-panel-${g.currency}`}
            tabIndex={i === current ? 0 : -1}
            className={["bank-ssi__tab", i === current && "bank-ssi__tab--active"].filter(Boolean).join(" ")}
            onClick={() => setActive(i)}
          >
            <span className="mono">{g.currency}</span>
            <span className="bank-ssi__tab-count">{g.records.length}</span>
          </button>
        ))}
      </div>
      <div
        role="tabpanel"
        id={`bank-ssi-panel-${group.currency}`}
        aria-labelledby={`bank-ssi-tab-${group.currency}`}
        className="bank-ssi__panel"
      >
        <SsiTable records={group.records} />
      </div>
    </div>
  );
}

/**
 * The full published-settlement-instructions section. Shared by the Bank
 * Directory result card (details inline — no click-through) and the bank
 * detail page.
 */
export function SettlementInstructions({
  groups,
  disclaimer,
}: {
  groups: CurrencyGroup[];
  disclaimer?: string;
}) {
  if (groups.length === 0) return null;
  return (
    <section className="bank-ssi" aria-labelledby="bank-ssi-title">
      <h2 id="bank-ssi-title">Published settlement instructions</h2>
      <p className="measure bank-ssi__intro">
        These are the correspondent banks this institution publishes for
        receiving payments. A currency can list more than one correspondent.
        Currencies lead with the settlement majors — USD, EUR, GBP — then
        alphabetical.
      </p>

      <SsiTabs groups={groups} />

      {disclaimer && <p className="bank-ssi__disclaimer">{disclaimer}</p>}
    </section>
  );
}
