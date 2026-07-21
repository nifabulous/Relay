/**
 * CaseDeskRoute — the lazy-loaded route target for `/learn/cases/:caseId`.
 *
 * Reads the `:caseId` route param, looks the case up in the catalog, and:
 *   - renders a clear "case not found" state with a link back to Learn when
 *     the id is unknown (so a typo or stale bookmark degrades gracefully),
 *   - otherwise renders the real Case Desk.
 *
 * Task 4 replaced the prior placeholder body with the CaseDesk component
 * (brief → investigate → recommend → resolve → debrief). The route's
 * missing-case handling and breadcrumb are preserved.
 */

import { useParams, Link } from "react-router-dom";
import { supplierCase } from "./caseCatalog";
import type { CaseDefinition } from "./caseTypes";
import { CaseDesk } from "./CaseDesk";
import "../LearnPage.css";

const KNOWN_CASES: ReadonlyArray<CaseDefinition> = [supplierCase];

export function CaseDeskRoute() {
  const { caseId } = useParams<{ caseId: string }>();
  const match = KNOWN_CASES.find((c) => c.id === caseId) ?? null;

  if (!match) {
    return (
      <div className="learn-page">
        <nav className="learn-breadcrumb" aria-label="Breadcrumb">
          <Link to="/learn">Learn</Link>
          <span aria-hidden="true">/</span>
          <span>Case</span>
        </nav>
        <div className="learn-locked">
          <h1>Case not found</h1>
          <p className="measure">
            We couldn't find a case at this address. It may have moved, or the
            link may be out of date.
          </p>
          <Link to="/learn" className="relay-btn relay-btn--secondary">
            Back to Learn
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="learn-page">
      <nav className="learn-breadcrumb" aria-label="Breadcrumb">
        <Link to="/learn">Learn</Link>
        <span aria-hidden="true">/</span>
        <span>{match.title}</span>
      </nav>

      {/* The Case Desk owns the brief → investigate → recommend → resolve →
          debrief flow, persistence, and focus management. The route just
          passes the matched caseId and keeps the breadcrumb + missing-case
          handling intact. */}
      <CaseDesk caseId={match.id} />
    </div>
  );
}
