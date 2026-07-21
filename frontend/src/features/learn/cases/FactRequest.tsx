/**
 * FactRequest — the investigation controls for gathering facts.
 *
 * Renders every `requestable` fact in the case as a native checkbox. The
 * learner toggles the checkboxes to build the requested set, then presses
 * "Request facts" to commit it (the Case Desk dispatches `request-facts`).
 *
 * Native controls only: real <input type="checkbox"> elements, each labelled
 * by its fact name, with a 44px tap target via the label wrapper.
 *
 * Purely presentational: it receives the current requestedFactIds and an
 * onChange callback that returns the next id set. The Case Desk owns the
 * dispatch + persistence.
 */
import { useId } from "react";
import type { CaseDefinition } from "./caseTypes";
import { Button } from "../../../design-system/Button";
import "./FactRequest.css";

export interface FactRequestProps {
  definition: CaseDefinition;
  requestedFactIds: string[];
  onChange: (ids: string[]) => void;
  onRequest: (ids: string[]) => void;
}

export function FactRequest({ definition, requestedFactIds, onChange, onRequest }: FactRequestProps) {
  const fieldsetId = useId();
  const requestedSet = new Set(requestedFactIds);
  const requestableFacts = definition.facts.filter((f) => f.requestable);

  function toggle(id: string, checked: boolean) {
    const next = new Set(requestedSet);
    if (checked) next.add(id);
    else next.delete(id);
    // Preserve authored fact order so the list is stable across toggles.
    const ordered = definition.facts
      .filter((f) => f.requestable && next.has(f.id))
      .map((f) => f.id);
    onChange(ordered);
  }

  return (
    <section className="fact-request" aria-labelledby={`${fieldsetId}-title`}>
      <header className="fact-request__header">
        <h2 id={`${fieldsetId}-title`} className="fact-request__title">
          Request facts
        </h2>
        <p className="fact-request__desc">
          Select the facts you want to gather, then request them to add the
          results to your evidence.
        </p>
      </header>

      {requestableFacts.length === 0 ? (
        <p className="fact-request__empty">There are no additional facts to request.</p>
      ) : (
        <fieldset className="fact-request__fieldset" id={fieldsetId}>
          <legend className="fact-request__legend">Available facts</legend>
          <ul className="fact-request__list">
            {requestableFacts.map((fact) => {
              const inputId = `${fieldsetId}-${fact.id}`;
              const checked = requestedSet.has(fact.id);
              return (
                <li key={fact.id} className="fact-request__item">
                  <label htmlFor={inputId} className="fact-request__label">
                    <input
                      id={inputId}
                      type="checkbox"
                      className="fact-request__checkbox"
                      checked={checked}
                      onChange={(e) => toggle(fact.id, e.target.checked)}
                    />
                    <span className="fact-request__label-text">{fact.label}</span>
                    {checked && (
                      <span className="fact-request__pending" aria-label="Pending request">
                        will be requested
                      </span>
                    )}
                  </label>
                </li>
              );
            })}
          </ul>
        </fieldset>
      )}

      <Button
        variant="primary"
        className="fact-request__action"
        onClick={() => onRequest([...requestedSet])}
        disabled={requestableFacts.length === 0}
      >
        Request facts
      </Button>
    </section>
  );
}
