/**
 * RailShortlist — the rail selection surface for the Case Desk.
 *
 * Each rail is exposed through TWO independent native controls:
 *
 *   1. A radio (single-select) for the learner's RECOMMENDED rail
 *      (`draft.selectedRail`). No rail is preselected — selectedRail starts
 *      null and the radios render unchecked.
 *   2. A checkbox (multi-select) for the SHORTLIST (`draft.shortlist`). The
 *      shortlist is the advisory set of rails the learner is weighing; the
 *      radio is the single rail they would recommend.
 *
 * Ineligible rails (per `validateShortlist`) show an `invalid` StatusChip so
 * the learner sees why a domestic-only rail does not fit a cross-border case.
 *
 * Purely presentational: takes the definition + draft and an onChange patch
 * callback. The Case Desk owns the dispatch + persistence.
 */
import { useId, type RefObject } from "react";
import type { CaseDefinition, RecommendationDraft } from "./caseTypes";
import { validateShortlist } from "./caseEvaluator";
import { StatusChip } from "../../../design-system/StatusChip";
import "./RailShortlist.css";

export interface RailShortlistProps {
  definition: CaseDefinition;
  draft: RecommendationDraft;
  onChange: (patch: Partial<RecommendationDraft>) => void;
  /**
   * Optional ref applied to the section heading. The Case Desk uses this as
   * the programmatic focus target after an evidence change invalidates the
   * dependent decisions (DESIGN spec §invalidation: "move focus to the
   * first affected decision"). The heading carries tabIndex={-1} only when
   * a ref is passed, so it joins the focus order solely as a target.
   */
  headingRef?: RefObject<HTMLHeadingElement | null>;
}

export function RailShortlist({ definition, draft, onChange, headingRef }: RailShortlistProps) {
  const fieldsetId = useId();
  // validateShortlist reports ineligible rails across the current shortlist;
  // for per-rail invalid marking we also evaluate a single-rail shortlist so
  // every rail is independently labelled.
  function isRailInvalid(railId: string): boolean {
    return validateShortlist(definition, { ...draft, shortlist: [railId] }).invalidRailIds.includes(railId);
  }

  function toggleShortlist(railId: string, checked: boolean) {
    const set = new Set(draft.shortlist);
    if (checked) set.add(railId);
    else set.delete(railId);
    // Preserve authored rail order for a stable list.
    const ordered = definition.rails.filter((r) => set.has(r.id)).map((r) => r.id);
    onChange({ shortlist: ordered });
  }

  return (
    <section className="rail-shortlist" aria-labelledby={`${fieldsetId}-title`}>
      <header className="rail-shortlist__header">
        <h2
          id={`${fieldsetId}-title`}
          className="rail-shortlist__title"
          ref={headingRef}
          // tabIndex={-1} only when a focus target is needed (ref passed),
          // so the heading is a programmatic-focus target without joining
          // the keyboard tab order.
          tabIndex={headingRef ? -1 : undefined}
        >
          Rails
        </h2>
        <p className="rail-shortlist__desc">
          Add rails to your shortlist to weigh them, then choose one to
          recommend. Nothing is preselected.
        </p>
      </header>

      {/* The fieldset is the semantic grouping for the rail-selection radio
          group AND the stable validation-link target (spec L213). id is
          hardcoded (not useId-prefixed) so the summary's fragment anchor
          resolves regardless of React's generated-id prefix. tabIndex={-1}
          makes it a valid programmatic-focus target so activating the
          validation link moves the learner to an actionable control, not
          just scroll-position. The legend is visually-hidden but available
          to AT. */}
      <fieldset
        className="rail-shortlist__rails"
        id="case-desk-rail-shortlist"
        tabIndex={-1}
      >
        <legend className="rail-shortlist__rails-legend">
          Select a rail to recommend
        </legend>
      <ul className="rail-shortlist__list">
        {definition.rails.map((rail) => {
          const railRegionLabel = rail.name;
          const invalid = isRailInvalid(rail.id);
          const shortlisted = draft.shortlist.includes(rail.id);
          const selected = draft.selectedRail === rail.id;
          return (
            <li
              key={rail.id}
              className="rail-shortlist__item"
            >
              <section
                className="rail-shortlist__rail"
                aria-label={railRegionLabel}
              >
                <div className="rail-shortlist__rail-head">
                  {/* The radio (single-select recommended rail). name is shared
                      across the group so only one can be checked. */}
                  <label className="rail-shortlist__radio-label">
                    <input
                      type="radio"
                      name={`${fieldsetId}-selectedRail`}
                      className="rail-shortlist__radio"
                      value={rail.id}
                      checked={selected}
                      onChange={() => onChange({ selectedRail: rail.id })}
                    />
                    <span className="rail-shortlist__rail-name">{rail.name}</span>
                  </label>

                  {/* The shortlist checkbox (multi-select). Distinct from the
                      radio: lives on the same row but is an independent input. */}
                  <label className="rail-shortlist__shortlist-label">
                    <input
                      type="checkbox"
                      className="rail-shortlist__shortlist-checkbox"
                      checked={shortlisted}
                      onChange={(e) => toggleShortlist(rail.id, e.target.checked)}
                    />
                    <span className="rail-shortlist__shortlist-text">Add to shortlist</span>
                  </label>

                  {invalid && <StatusChip status="invalid" className="rail-shortlist__invalid" />}
                </div>

                <p className="rail-shortlist__eligibility">{rail.eligibility}</p>
                {rail.reasons.length > 0 && (
                  <ul className="rail-shortlist__reasons">
                    {rail.reasons.map((reason) => (
                      <li key={reason} className="rail-shortlist__reason">{reason}</li>
                    ))}
                  </ul>
                )}
              </section>
            </li>
          );
        })}
      </ul>
      </fieldset>
    </section>
  );
}
