import { useState, useCallback } from "react";
import type { LabContentProps, ExerciseChecker } from "../labTypes";
import { Exercise } from "../components/Exercise";
import { MultipleChoice } from "../components/MultipleChoice";
import { Button } from "../../../design-system/Button";
import { PaymentTimeline } from "../../../features/operate/tracking/PaymentTimeline";
import { apiPost } from "../../../api/client";
import { TrackPaymentResponseSchema } from "../../../api/schemas";
import type { TrackPaymentResponse } from "../../../api/schemas";
import "./LabContent.css";

/**
 * Exceptions & Returns lab.
 *
 * The capstone walks the happy path. This module teaches what happens when a
 * payment DOESN'T make it: rejects before settlement, returns after
 * settlement (pacs.004), sender-initiated recalls (camt.056), and the
 * aftermath of ignoring a NO_MATCH.
 */

const DOOMED_PAYMENT = {
  originator_bic: "BOFAUS3N",
  originator_name: "Bank of America",
  beneficiary_bic: "GTBINGLAXXX",
  beneficiary_name: "GTBank",
  currency: "USD",
  amount: 5000,
  charge_code: "SHA" as const,
  intermediary_bics: ["CITIUS33"],
  intermediary_names: ["Citibank"],
  outcome: "rejected" as const,
};

const RETURN_CODES = [
  { code: "AC01", meaning: "Account number incorrect", example: "The IBAN passed checksum but doesn't exist at the bank" },
  { code: "AC04", meaning: "Account closed", example: "The beneficiary shut the account last month" },
  { code: "AC06", meaning: "Account blocked", example: "The account is frozen — often a compliance hold" },
  { code: "AM05", meaning: "Duplicate payment", example: "The same transfer was submitted twice" },
  { code: "CUST", meaning: "Requested by customer", example: "The beneficiary refused the funds" },
  { code: "FOCR", meaning: "Following cancellation request", example: "Returned because the sender sent a recall (camt.056)" },
  { code: "FRAD", meaning: "Fraudulent origin", example: "The receiving bank believes the payment is fraud-related" },
];

const RETURN_CODE_QUESTION = {
  question:
    "Your salary payment bounces back two days after you sent it. The beneficiary had switched employers and closed the account. Which return reason code rides on the pacs.004?",
  options: [
    {
      id: "ac01",
      label: "AC01",
      correct: false,
      explanation:
        "AC01 covers a different account problem — the number itself being wrong. This account number was right when it was issued.",
    },
    {
      id: "ac04",
      label: "AC04",
      correct: true,
      explanation:
        "Correct. AC04 = account closed. The account existed once, but nobody can credit a closed account, so the beneficiary bank returns the funds with AC04 on the pacs.004.",
    },
    {
      id: "am05",
      label: "AM05",
      correct: false,
      explanation:
        "AM05 flags a duplicate submission — nothing was sent twice here.",
    },
    {
      id: "frad",
      label: "FRAD",
      correct: false,
      explanation:
        "FRAD is reserved for suspected fraud. A routine account closure is an ordinary operational return.",
    },
  ],
};

const RECALL_QUESTION = {
  question:
    "You paid a supplier's OLD bank account; the money settled an hour ago. Your bank sends a camt.056 recall request. What does the camt.056 actually do?",
  options: [
    {
      id: "reverses",
      label: "Reverses the settlement automatically",
      correct: false,
      explanation:
        "Settled means settled — no message can undo a completed transfer. That finality is a feature of payment systems, not a bug.",
    },
    {
      id: "asks",
      label: "Asks the beneficiary bank to return the funds — it can say no",
      correct: true,
      explanation:
        "Correct. A recall is a request, not a command. The beneficiary bank answers with a camt.029 (resolution) and usually needs its customer's consent — or a debtor-protection reason — before returning anything. If it agrees, the money comes back as a pacs.004 with code FOCR.",
    },
    {
      id: "freezes",
      label: "Freezes the beneficiary's whole account during review",
      correct: false,
      explanation:
        "A recall has no power over the beneficiary's account. Freezing requires the receiving bank's own compliance or legal process.",
    },
    {
      id: "fines",
      label: "Fines the beneficiary bank if it doesn't respond in 24 hours",
      correct: false,
      explanation:
        "Schemes set response-time expectations, but there's no automatic fine — and 'respond' can legitimately mean 'we asked our customer and they refused'.",
    },
  ],
};

const MISDIRECT_QUESTION = {
  question:
    "In Lab 3, VoP said NO_MATCH but the sender pushed the payment through anyway. It settled into a stranger's account. What is the sender's best move now?",
  options: [
    {
      id: "recall-fast",
      label: "Contact the bank immediately and request a recall — speed matters, recovery isn't guaranteed",
      correct: true,
      explanation:
        "Correct. The faster the camt.056 goes out, the better the odds the funds are still in the account. But the account holder must consent to (or be legally compelled into) the return — this is exactly why VoP exists BEFORE the send.",
    },
    {
      id: "auto-return",
      label: "Nothing — banks detect misdirected payments and auto-return them",
      correct: false,
      explanation:
        "No bank scans settled credits for 'looks misdirected'. Until someone raises it, the money just sits in the wrong account.",
    },
    {
      id: "chargeback",
      label: "File a chargeback, like a card dispute",
      correct: false,
      explanation:
        "Chargebacks exist on card rails. Credit transfers have no chargeback right — that difference is the whole reason push-payment fraud targets bank transfers.",
    },
    {
      id: "police-only",
      label: "Report it to the police and wait",
      correct: false,
      explanation:
        "A crime report may eventually help, but the immediate operational move is the recall request — hours matter when the account can be emptied.",
    },
  ],
};

export function ExceptionsReturnsContent({ moduleId, onCheckpoint }: LabContentProps) {
  const [payment, setPayment] = useState<TrackPaymentResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createDoomedPayment = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setPayment(null);

    try {
      const result = await apiPost<TrackPaymentResponse>(
        "/api/track/create",
        DOOMED_PAYMENT,
        TrackPaymentResponseSchema,
      );
      setPayment(result);
      onCheckpoint("simulate-rejection");
    } catch {
      setError("Could not create the simulated payment. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, [onCheckpoint]);

  // Exercise: read the timeline and name the bank that killed the payment.
  const checkRejectionReader: ExerciseChecker = useCallback(
    (answer) => {
      if (!payment) {
        return { correct: false, feedback: "Create the doomed payment first, then read its timeline." };
      }
      const cleaned = answer.trim().toLowerCase();
      if (cleaned.includes("citi")) {
        return {
          correct: true,
          feedback:
            "Correct — Citibank, the first intermediary, rejected it at compliance screening. Bank of America initiated fine, and GTBank never saw the payment at all. The money never left the sender's side of the chain.",
        };
      }
      if (cleaned.includes("gtbank") || cleaned.includes("gt bank")) {
        return {
          correct: false,
          feedback:
            "Look again — the timeline stops before the beneficiary bank. GTBank never received anything to reject.",
        };
      }
      if (cleaned.includes("bofa") || cleaned.includes("bank of america")) {
        return {
          correct: false,
          feedback:
            "Bank of America initiated the payment successfully. Follow the timeline to where the status turns to rejected.",
        };
      }
      return {
        correct: false,
        feedback: "Read the timeline's final event: which bank's name is on the rejection?",
      };
    },
    [payment],
  );

  return (
    <div className="lab-content" data-module-id={moduleId}>
      <section className="lab-section">
        <h2>When payments don't make it</h2>
        <p className="measure">
          Everything so far — validation, VoP, routing, tracking — walked the happy path.
          Operations teams spend their days on the other one. A payment can bounce before
          settlement, come back after settlement, or land in the wrong account entirely,
          and each failure has its own vocabulary, its own message type, and its own
          recovery odds.
        </p>
        <table className="lab-table">
          <thead>
            <tr>
              <th>Exception</th>
              <th>When</th>
              <th>ISO 20022 message</th>
              <th>Who starts it</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><strong>Reject</strong></td>
              <td>Before settlement</td>
              <td className="mono">pacs.002 (RJCT)</td>
              <td>Any bank in the chain</td>
            </tr>
            <tr>
              <td><strong>Return</strong></td>
              <td>After settlement</td>
              <td className="mono">pacs.004</td>
              <td>The beneficiary bank</td>
            </tr>
            <tr>
              <td><strong>Recall</strong></td>
              <td>After sending — sender's request</td>
              <td className="mono">camt.056 → camt.029</td>
              <td>The sender's bank</td>
            </tr>
          </tbody>
        </table>
        <p className="measure lab-muted">
          In the MT era these were an MT103 marked RETN and the MT192/MT196
          request-and-answer pair — the ISO 20022 messages above replaced them along with
          the MT103 itself (Lab 8).
        </p>
      </section>

      <div className="lab-sim-notice" role="note">
        <strong>Simulation — not a real payment.</strong> All events below are illustrative.
      </div>

      <section className="lab-section">
        <h2>Watch a payment die</h2>
        <p className="measure">
          This payment is doomed: $5,000 from Bank of America to GTBank, routed through
          Citibank — where compliance screening will reject it. Create it and read the
          timeline closely.
        </p>
        <Button variant="primary" onClick={createDoomedPayment} isLoading={isLoading}>
          Create the doomed payment
        </Button>

        {error && <div className="lab-error" role="alert">{error}</div>}

        {payment && (
          <>
            <PaymentTimeline payment={payment} hideFees />
            <Exercise
              id="ex-read-rejection"
              title="Exercise: Where did it die?"
              prompt="Three banks appear in this payment's story. Which bank rejected it?"
              label="Bank name"
              placeholder="e.g. one of the three banks above"
              hint="Follow the timeline top to bottom. The initiating bank and the beneficiary bank both behave normally — the rejection happens in the middle of the chain."
              checkAnswer={checkRejectionReader}
              onCorrect={() => onCheckpoint("read-rejection")}
            />
            <p className="measure lab-muted">
              Note what a reject means for the money: it never settled, so nothing needs
              recovering. The sender's account is simply re-credited. Rejects are the
              CHEAP failure — everything after settlement costs more.
            </p>
          </>
        )}
      </section>

      <section className="lab-section">
        <h2>Returns: the pacs.004 and its reason codes</h2>
        <p className="measure">
          When a payment has already settled and the receiving bank sends it back — a
          closed account, a blocked account, a customer refusing the funds — the money
          travels on a <strong>pacs.004</strong> return message carrying a standardized
          reason code. Returns can take days, and intermediaries may lift fees on the way
          back too: what returns is not always what was sent.
        </p>
        <table className="lab-table">
          <thead>
            <tr>
              <th>Code</th>
              <th>Meaning</th>
              <th>Typical story</th>
            </tr>
          </thead>
          <tbody>
            {RETURN_CODES.map((rc) => (
              <tr key={rc.code}>
                <td className="mono">{rc.code}</td>
                <td>{rc.meaning}</td>
                <td>{rc.example}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <MultipleChoice
          question={RETURN_CODE_QUESTION.question}
          options={RETURN_CODE_QUESTION.options}
          onCorrect={() => onCheckpoint("map-return-code")}
        />
      </section>

      <section className="lab-section">
        <h2>Recalls: asking for your money back</h2>
        <p className="measure">
          A return is the receiving bank's decision. A <strong>recall</strong> goes the
          other way: the sender realizes something is wrong — duplicate, wrong account,
          fraud — and asks for the money back. The request travels as a{" "}
          <span className="mono">camt.056</span>; the answer comes back as a{" "}
          <span className="mono">camt.029</span>. The critical word is <em>asks</em>.
        </p>
        <MultipleChoice
          question={RECALL_QUESTION.question}
          options={RECALL_QUESTION.options}
          onCorrect={() => onCheckpoint("recall-reality")}
        />
      </section>

      <section className="lab-section">
        <h2>The NO_MATCH aftermath</h2>
        <p className="measure">
          Lab 3 taught you that NO_MATCH should stop a payment outright. Here is why the
          rule has teeth: once a misdirected payment settles, every recovery path runs
          through the account holder who received it. Prevention is a one-second API
          check; recovery is a multi-week negotiation that can simply fail. (Lab 9's APP
          reimbursement rules exist because so many of these negotiations do.)
        </p>
        <MultipleChoice
          question={MISDIRECT_QUESTION.question}
          options={MISDIRECT_QUESTION.options}
          onCorrect={() => onCheckpoint("misdirected-aftermath")}
        />
      </section>

      <section className="lab-section">
        <h2>Where you'll use this next</h2>
        <p className="measure">
          The Ops Desk module picks up from here: payments that didn't reject cleanly but
          stalled with broken fields, and the repair queue that fixes them. And when a
          return does arrive, someone has to match it against the original payment on the
          Nostro statement — that's reconciliation, also in the Ops Desk.
        </p>
      </section>
    </div>
  );
}
