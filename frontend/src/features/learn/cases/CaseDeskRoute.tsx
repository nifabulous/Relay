/**
 * CaseDeskRoute — the lazy-loaded route target for `/learn/cases/:caseId`.
 *
 * Task 3 deliverable: a MINIMAL placeholder that
 *   - reads the `:caseId` route param,
 *   - looks the case up in the catalog,
 *   - renders a clear "case not found" state with a link back to Learn when
 *     the id is unknown (so a typo or stale bookmark degrades gracefully),
 *   - otherwise renders the case title + a Task-4 placeholder note.
 *
 * Task 4 will replace the placeholder body with the real CaseDesk component
 * (brief → investigate → recommend → resolve → debrief). The route's
 * EXISTENCE and ORDERING in App.tsx is the critical Task-3 deliverable; this
 * file just gives the route something honest to render.
 */

import { useParams, Link } from "react-router-dom";
import { supplierCase } from "./caseCatalog";
import type { CaseDefinition } from "./caseTypes";
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

      <div className="learn-module-header">
        <div className="learn-module-header__title-row">
          <h1>{match.title}</h1>
        </div>
        <p className="measure">{match.customerRequest}</p>
        <div className="learn-module-header__meta">
          <span>Last verified {match.verifiedAt}</span>
        </div>
      </div>

      {/* TASK-4 REPLACE POINT — the real Case Desk (brief → investigate →
          recommend → resolve → debrief) will replace this note. Keeping the
          surface minimal here so the route resolves to SOMETHING honest
          while the full experience is built in Task 4. */}
      <div className="learn-content__callout">
        Case desk coming in Task 4.
      </div>

      <div className="learn-nav">
        <Link to="/learn" className="relay-btn relay-btn--secondary learn-nav__prev">
          Back to Learn
        </Link>
      </div>
    </div>
  );
}
