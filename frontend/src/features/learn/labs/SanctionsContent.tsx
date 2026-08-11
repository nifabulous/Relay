import { useState, useRef, useCallback, type FormEvent } from "react";
import type { LabContentProps, ExerciseChecker } from "../labTypes";
import { Exercise } from "../components/Exercise";
import { MultipleChoice } from "../components/MultipleChoice";
import { ScoreBar } from "../components/ScoreBar";
import { Button } from "../../../design-system/Button";
import { StatusChip } from "../../../design-system/StatusChip";
import { apiPost } from "../../../api/client";
import { ScreenResponseSchema } from "../../../api/schemas";
import type { ScreenResponse } from "../../../api/schemas";
import "./LabContent.css";

/**
 * Sanctions Screening lab.
 *
 * Teaches watchlist screening on the /api/screen endpoint: the fictional
 * training watchlist, fuzzy-score decision bands (CLEAR / POSSIBLE_HIT /
 * HARD_HIT), screening at every hop of a correspondent chain, and what a
 * compliance hold actually looks like from the payment's point of view.
 *
 * Every scenario name below is verified against the real backend scores:
 *   "Adaeze Okafor"  → 0.40 CLEAR
 *   "Tarik Kasem"    → 0.87 POSSIBLE_HIT (REVIEW)
 *   "Tariq Kassem"   → 1.00 HARD_HIT (BLOCKED at hop 0)
 */

const DEMO_SENDER = "Acme Manufacturing Inc";

const DEMO_CHAIN = {
  bics: ["CITIUS33XXX"],
  names: ["Citibank N.A."],
};

const SCENARIOS = [
  {
    id: "clean",
    label: "Use clean payment",
    name: "Adaeze Okafor",
    description: "A name nowhere near the watchlist",
  },
  {
    id: "possible",
    label: "Use possible hit",
    name: "Tarik Kasem",
    description: "One letter swap away from a listed name",
  },
  {
    id: "hard",
    label: "Use hard hit",
    name: "Tariq Kassem",
    description: "An exact watchlist name",
  },
] as const;

const THRESHOLD_QUESTION = {
  question:
    "A beneficiary name scores 0.82 against a watchlist entry. What does the screening engine do with the payment?",
  options: [
    {
      id: "pass",
      label: "Lets it pass — only exact matches count",
      correct: false,
      explanation:
        "Sanctioned parties rarely spell their name the way the list does. Screening is built to catch variations, so a score this high cannot simply pass.",
    },
    {
      id: "hold",
      label: "Holds it for a human compliance review",
      correct: true,
      explanation:
        "Correct. 0.82 sits in the possible-hit band (0.75 to just under 0.90): too close to ignore, not close enough to auto-reject. A compliance analyst decides — and the payment waits, typically for hours or days.",
    },
    {
      id: "reject",
      label: "Rejects it automatically",
      correct: false,
      explanation:
        "Auto-rejection is reserved for the highest-confidence band. Rejecting every mid-score name would block enormous volumes of legitimate payments.",
    },
    {
      id: "rename",
      label: "Corrects the name and sends it on",
      correct: false,
      explanation:
        "No bank ever edits a party name to make screening pass — that would defeat the control and is itself a compliance breach.",
    },
  ],
};

const ESCALATION_QUESTION = {
  question:
    "Your payment is held as a POSSIBLE_HIT at an intermediary bank. You call your bank to ask what's happening. What are you told?",
  options: [
    {
      id: "told-list",
      label: "\"Your beneficiary resembles entry TRN-001 on the OFAC list\"",
      correct: false,
      explanation:
        "Banks do not disclose screening specifics — telling a customer exactly what tripped the filter would let bad actors tune their evasion.",
    },
    {
      id: "under-review",
      label: "\"The payment is under review; we may ask you for more information\"",
      correct: true,
      explanation:
        "Correct. The compliance team reviews the hit and may send a Request for Information (RFI) — who is the beneficiary, what is the payment for, supporting invoices. Answer fast and completely: the clock only restarts when you do.",
    },
    {
      id: "cancel-retry",
      label: "\"Cancel it and resend with a slightly different beneficiary name\"",
      correct: false,
      explanation:
        "Resubmitting with a tweaked name to dodge a filter is called stripping, and it is one of the most heavily punished behaviors in payments — banks have paid multi-billion-dollar fines for it.",
    },
    {
      id: "auto-release",
      label: "\"Holds release automatically after 24 hours\"",
      correct: false,
      explanation:
        "There is no automatic release. A held payment moves only when a human clears it — which is why one fuzzy name can add days to a transfer.",
    },
  ],
};

const FALSE_POSITIVE_QUESTION = {
  question:
    "Most screening hits turn out to be false positives — ordinary customers who happen to resemble a listed name. Why does name-only screening (like this simulator) make that worse?",
  options: [
    {
      id: "names-shared",
      label: "Many people legitimately share or nearly share names; without DOB, address, or ID there's nothing to tell them apart",
      correct: true,
      explanation:
        "Correct. Real screening engines add secondary identifiers — date of birth, nationality, address, passport number — to separate the listed person from the thousands who merely share the name. This simulator screens the name alone, so it over-flags by design.",
    },
    {
      id: "lists-wrong",
      label: "Sanctions lists are mostly out of date",
      correct: false,
      explanation:
        "Lists update constantly — staleness is an operational risk but it isn't what makes matches ambiguous.",
    },
    {
      id: "fuzzy-bug",
      label: "Fuzzy matching is a bug that better software removes",
      correct: false,
      explanation:
        "Fuzzy matching is deliberate — transliterated and misspelled names must still hit. The fix for false positives is more context, not stricter spelling.",
    },
    {
      id: "banks-lazy",
      label: "Banks don't bother reviewing the hits",
      correct: false,
      explanation:
        "The opposite: every hit queues for human review. That workload is exactly why false-positive rates matter so much.",
    },
  ],
};

type RanKind = "clear" | "flagged";

export function SanctionsContent({ moduleId, onCheckpoint }: LabContentProps) {
  const [beneficiary, setBeneficiary] = useState("");
  const [result, setResult] = useState<ScreenResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ranKinds = useRef(new Set<RanKind>());
  const scenariosFired = useRef(false);

  const runScreening = useCallback(
    async (name: string) => {
      const trimmed = name.trim();
      if (!trimmed) {
        setError("Enter a beneficiary name to screen.");
        return;
      }
      setIsLoading(true);
      setError(null);

      try {
        const res = await apiPost<ScreenResponse>(
          "/api/screen",
          {
            sender_name: DEMO_SENDER,
            beneficiary_name: trimmed,
            intermediary_bics: DEMO_CHAIN.bics,
            intermediary_names: DEMO_CHAIN.names,
          },
          ScreenResponseSchema,
        );
        setResult(res);

        ranKinds.current.add(res.overall_recommendation === "CLEAR" ? "clear" : "flagged");
        // Fires once the learner has seen both a clean pass AND a flagged
        // payment — the lesson is the contrast between the two.
        if (!scenariosFired.current && ranKinds.current.size >= 2) {
          scenariosFired.current = true;
          onCheckpoint("screen-scenarios");
        }
      } catch {
        setError("Could not run the screening. Please try again.");
      } finally {
        setIsLoading(false);
      }
    },
    [onCheckpoint],
  );

  const handleSubmit = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      runScreening(beneficiary);
    },
    [beneficiary, runScreening],
  );

  // Exercise: craft a name that lands in the possible-hit band. The check
  // runs against the live screening engine — same as the demo above.
  const checkPossibleHit: ExerciseChecker = useCallback(async (input, signal) => {
    const res = await apiPost<ScreenResponse>(
      "/api/screen",
      {
        sender_name: DEMO_SENDER,
        beneficiary_name: input,
        intermediary_bics: [],
        intermediary_names: [],
      },
      ScreenResponseSchema,
      { signal },
    );
    const rec = res.beneficiary.recommendation;
    const score = res.beneficiary.score;
    const scoreText = typeof score === "number" ? score.toFixed(2) : "—";

    if (rec === "REVIEW") {
      return {
        correct: true,
        feedback: `"${input}" scores ${scoreText} — inside the possible-hit band (0.75 to just under 0.90). This payment holds for compliance review: close enough to worry, not close enough to auto-reject.`,
      };
    }
    if (rec === "REJECT") {
      return {
        correct: false,
        feedback: `"${input}" scores ${scoreText} — that's a HARD hit (≥ 0.90) and an automatic reject. You've overshot: change the name a little more.`,
      };
    }
    return {
      correct: false,
      feedback: `"${input}" scores ${scoreText} — the engine clears it (< 0.75). Start from a listed name like "Tariq Kassem" and change one or two letters.`,
    };
  }, []);

  return (
    <div className="lab-content" data-module-id={moduleId}>
      <section className="lab-section">
        <h2>The list every payment is checked against</h2>
        <p className="measure">
          Before any bank moves your money, it checks the parties against{" "}
          <strong>sanctions watchlists</strong> — registers of people, companies, and even
          ships that banks are legally forbidden to serve. The best known is OFAC's SDN
          list in the US; the UN, EU, and UK OFSI publish their own. A bank that processes
          a payment for a listed party faces fines that have run into the billions —
          so every payment, every party, every time.
        </p>
        <p className="measure">
          This lab uses the same name-matching engine you met in Lab 3 (Verification of
          Payee), pointed at a <strong>fictional training watchlist</strong>. No real
          sanctions data appears anywhere in this simulator — every listed name below is
          invented.
        </p>
      </section>

      <section className="lab-section">
        <h2>Three bands, three outcomes</h2>
        <p className="measure">
          VoP asks "is this the right person?" — screening asks "is this a{" "}
          <em>forbidden</em> person?" Same fuzzy scores, much more cautious posture. The
          engine sorts every score into one of three bands:
        </p>
        <table className="lab-table">
          <thead>
            <tr>
              <th>Score</th>
              <th>Decision</th>
              <th>Action</th>
              <th>What the payment experiences</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="mono">≥ 0.90</td>
              <td>HARD_HIT</td>
              <td>REJECT</td>
              <td>Stopped on the spot; funds may be frozen</td>
            </tr>
            <tr>
              <td className="mono">0.75 – &lt; 0.90</td>
              <td>POSSIBLE_HIT</td>
              <td>HOLD</td>
              <td>Waits ~24h+ for a human compliance analyst</td>
            </tr>
            <tr>
              <td className="mono">&lt; 0.75</td>
              <td>CLEAR</td>
              <td>PASS</td>
              <td>Moves on after a few minutes of automated checks</td>
            </tr>
          </tbody>
        </table>
        <p className="measure lab-muted">
          Compare Lab 3: VoP treated 0.75 up to 0.90 as a "close match" you could confirm
          and proceed with. Screening treats the same band as a reason to stop the payment.
          Sanctions errs cautious — a missed hit costs far more than a delayed transfer.
        </p>
        <MultipleChoice
          question={THRESHOLD_QUESTION.question}
          options={THRESHOLD_QUESTION.options}
          onCorrect={() => onCheckpoint("judge-threshold")}
        />
      </section>

      <section className="lab-section">
        <h2>Screen a payment</h2>
        <p className="measure">
          Sender <strong>{DEMO_SENDER}</strong> pays a beneficiary through{" "}
          {DEMO_CHAIN.names[0]}. Screen at least one clean payment and one flagged one,
          and watch what each bank in the chain decides.
        </p>

        <div className="lab-vop-scenarios">
          <p className="lab-vop-scenarios__label">Try a prepared example</p>
          {SCENARIOS.map((s) => (
            <button
              key={s.id}
              type="button"
              className="lab-vop-scenario-btn"
              onClick={() => {
                setBeneficiary(s.name);
                runScreening(s.name);
              }}
              disabled={isLoading}
            >
              {s.label}
              <span className="lab-vop-scenario-desc">{s.description}</span>
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="lab-vop-form">
          <div className="lab-vop-form__fields">
            <label className="lab-vop-form__field">
              Beneficiary name
              <input
                type="text"
                className="lab-vop-form__input"
                value={beneficiary}
                placeholder="e.g. Adaeze Okafor"
                onChange={(e) => setBeneficiary(e.target.value)}
              />
            </label>
          </div>
          <Button variant="primary" type="submit" isLoading={isLoading}>
            {isLoading ? "Screening…" : "Screen payment"}
          </Button>
        </form>

        {error && (
          <div className="lab-error" role="alert">
            {error}
          </div>
        )}

        {result && (
          <div className="lab-ssi-result" aria-live="polite">
            <p>
              Overall:{" "}
              <StatusChip
                status={
                  result.overall_recommendation === "CLEAR"
                    ? "passed"
                    : result.overall_recommendation === "REVIEW"
                      ? "under_review"
                      : "failed"
                }
              />{" "}
              <strong>{result.overall_recommendation}</strong>
              {result.blocked && result.blocked_at_hop !== null && result.blocked_at_hop !== undefined && (
                <> — blocked at hop {result.blocked_at_hop}</>
              )}
              {!result.blocked && (
                <>
                  {" "}
                  · total screening delay{" "}
                  <span className="mono">{result.total_delay_hours}h</span>
                </>
              )}
            </p>
            <ScoreBar
              score={typeof result.beneficiary.score === "number" ? result.beneficiary.score : 0}
              label={`Beneficiary "${result.beneficiary.name}" vs watchlist`}
            />
            <table className="lab-table">
              <thead>
                <tr>
                  <th>Hop</th>
                  <th>Bank</th>
                  <th>Decision</th>
                  <th>Action</th>
                  <th>Delay</th>
                </tr>
              </thead>
              <tbody>
                {result.hops.map((hop) => (
                  <tr key={hop.hop}>
                    <td className="mono">{hop.hop}</td>
                    <td>{hop.bank_name}</td>
                    <td>{hop.decision}</td>
                    <td>{hop.action}</td>
                    <td className="mono">{hop.delay_hours}h</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="lab-muted">
              Every bank in the chain re-screens the same payment. A name that clears the
              sender's filter can still be held two hops later — different banks tune
              their thresholds differently.
            </p>
          </div>
        )}
      </section>

      <Exercise
        id="ex-find-possible-hit"
        title="Exercise: Land in the grey zone"
        prompt={
          <>
            The training watchlist includes <strong>Tariq Kassem</strong>. Enter a
            beneficiary name that scores as a <strong>POSSIBLE_HIT</strong> — flagged for
            review (0.75 to just under 0.90), but not an automatic reject.
          </>
        }
        label="Name to screen"
        placeholder="e.g. a near-spelling of a listed name"
        hint={
          <>
            Change one or two letters of a listed name. "Tarik Kasem" drops the Q and one
            S; an exact "Tariq Kassem" would overshoot into a hard hit. This is exactly
            how transliterated names hit real filters.
          </>
        }
        checkAnswer={checkPossibleHit}
        onCorrect={() => onCheckpoint("find-possible-hit")}
      />

      <section className="lab-section">
        <h2>What a hold feels like</h2>
        <p className="measure">
          When screening flags a payment, nothing bounces and nobody calls. The money
          simply stops moving while a compliance analyst works a queue. The bank may send
          the sender a <strong>Request for Information</strong> — who is the beneficiary,
          what is the invoice, why this amount — and the payment waits until the answers
          satisfy the reviewer.
        </p>
        <MultipleChoice
          question={ESCALATION_QUESTION.question}
          options={ESCALATION_QUESTION.options}
          onCorrect={() => onCheckpoint("escalation-decision")}
        />
      </section>

      <section className="lab-section">
        <h2>The false-positive problem</h2>
        <p className="measure">
          Screening's daily reality isn't catching villains — it's clearing innocents.
          The overwhelming majority of hits are ordinary customers whose names resemble a
          listed one. Every false positive costs analyst time and delays a legitimate
          payment, which is why real engines augment names with dates of birth,
          addresses, and document numbers.
        </p>
        <MultipleChoice
          question={FALSE_POSITIVE_QUESTION.question}
          options={FALSE_POSITIVE_QUESTION.options}
          onCorrect={() => onCheckpoint("false-positive")}
        />
      </section>

      <section className="lab-section">
        <h2>Where you'll use this next</h2>
        <p className="measure">
          The Operate workspace has a standalone Screening tool for free experimentation,
          and the capstone's Decide step folds screening posture into the final
          PROCEED / REVIEW / STOP recommendation. If you later work the exceptions
          module, you'll see what happens to funds a screen has frozen.
        </p>
      </section>
    </div>
  );
}
