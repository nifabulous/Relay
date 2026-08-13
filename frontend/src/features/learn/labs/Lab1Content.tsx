import { useState, useCallback, useRef } from "react";
import type { LabContentProps, ExerciseChecker } from "../labTypes";
import { Decompose } from "../components/Decompose";
import { Exercise } from "../components/Exercise";
import { Button } from "../../../design-system/Button";
import { apiRequest } from "../../../api/client";
import { ValidateResponseSchema, LookupResponseSchema } from "../../../api/schemas";
import type { ValidateResponse, LookupResponse } from "../../../api/schemas";
import "./LabContent.css";

// Static decomposition data
const BIC_SEGMENTS = [
  { value: "CITI", tone: "accent" as const, label: "Bank code" },
  { value: "US", tone: "info" as const, label: "Country" },
  { value: "33", tone: "warning" as const, label: "Location" },
  { value: "XXX", tone: "info" as const, label: "Branch (HQ)" },
];

const IBAN_SEGMENTS = [
  { value: "GB", tone: "accent" as const, label: "Country" },
  { value: "29", tone: "warning" as const, label: "Checksum" },
  { value: "NWBK", tone: "info" as const, label: "Bank code" },
  { value: "601613", tone: "info" as const, label: "Sort code" },
  { value: "31926819", tone: "info" as const, label: "Account number" },
];

export function Lab1Content({ moduleId, onCheckpoint }: LabContentProps) {
  const [input, setInput] = useState("");
  const [result, setResult] = useState<ValidateResponse | null>(null);
  const [bankInfo, setBankInfo] = useState<LookupResponse["bank"] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const analyzedRef = useRef(false);

  const analyze = useCallback(async () => {
    const value = input.trim();
    if (!value) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsLoading(true);
    setError(null);
    setResult(null);
    setBankInfo(null);

    try {
      const validateRes = await apiRequest<ValidateResponse>(
        `/api/validate?value=${encodeURIComponent(value)}`,
        { signal: controller.signal },
        ValidateResponseSchema,
      );
      if (controller.signal.aborted) return;
      setResult(validateRes);

      // If a BIC was returned, look up the bank
      if (validateRes.bic) {
        try {
          const lookupRes = await apiRequest<LookupResponse>(
            `/api/lookup?bic=${encodeURIComponent(validateRes.bic)}`,
            { signal: controller.signal },
            LookupResponseSchema,
          );
          if (!controller.signal.aborted) {
            setBankInfo(lookupRes.bank);
          }
        } catch {
          // Lookup failure is non-fatal
        }
      }

      if (!analyzedRef.current) {
        analyzedRef.current = true;
        onCheckpoint("analyze-identifier");
      }
    } catch {
      if (!controller.signal.aborted) {
        setError("Could not validate this identifier. Please try again.");
      }
    } finally {
      if (!controller.signal.aborted) {
        setIsLoading(false);
      }
    }
  }, [input, onCheckpoint]);

  // Exercise checkers
  const checkCountry: ExerciseChecker = (answer) => {
    const normalized = answer.toLowerCase().replace(/[^a-z]/g, "");
    const correct = normalized === "nigeria" || normalized === "ng";
    return {
      correct,
      feedback: correct
        ? "Correct! GTBINGLAXXX — GTB is Guaranty Trust Bank, NG is Nigeria."
        : "Not quite. Look at the GTBINGLAXXX code: the 5th and 6th characters are the country code.",
    };
  };

  const checkBank: ExerciseChecker = (answer) => {
    const normalized = answer.toLowerCase().replace(/[^a-z]/g, "");
    const correct = normalized === "natwest" || normalized === "nwbk" || normalized === "nationalwestminster";
    return {
      correct,
      feedback: correct
        ? "Correct! NWBK is the bank code for NatWest (National Westminster Bank)."
        : "Look at the IBAN GB29NWBK60161331926819 — characters 5–8 are the bank code.",
    };
  };

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    setInput(e.target.value);
    setResult(null);
    setBankInfo(null);
    setError(null);
  }

  return (
    <div className="lab-content" data-module-id={moduleId}>
      {/* Static decomposition examples */}
      <section className="lab-section">
        <h2>A BIC decoded</h2>
        <p className="measure">A BIC (Bank Identifier Code) has four parts:</p>
        <Decompose segments={BIC_SEGMENTS} />
      </section>

      <section className="lab-section">
        <h2>An IBAN decoded</h2>
        <p className="measure">An IBAN (International Bank Account Number) starts with a country code and checksum:</p>
        <Decompose segments={IBAN_SEGMENTS} />
      </section>

      {/* Live analyzer */}
      <section className="lab-section">
        <h2>Try it yourself</h2>
        <p className="measure">Enter any BIC or IBAN to see it decomposed and validated.</p>
        <div className="lab-analyzer">
          <input
            type="text"
            className="lab-analyzer__input mono"
            placeholder="Enter a BIC or IBAN…"
            value={input}
            onChange={handleInputChange}
            aria-label="Identifier to analyze"
          />
          <Button variant="primary" onClick={analyze} isLoading={isLoading}>
            Analyze
          </Button>
        </div>

        {error && <div className="lab-error" role="alert">{error}</div>}

        {result && (
          <div className="lab-analyzer__result">
            <p>
              <strong>{result.input_type === "bic" ? "BIC / SWIFT code" : "IBAN"}</strong> analysis:
            </p>
            {result.valid ? (
              <p className="lab-valid">✓ Format is valid{result.bic ? ` — BIC: ${result.bic}` : ""}</p>
            ) : (
              <p className="lab-invalid">✗ Invalid format{result.errors.length > 0 ? ` — ${result.errors[0]}` : ""}</p>
            )}
            {bankInfo ? (
              <p>Bank: <strong>{bankInfo.bank_name}</strong>, {bankInfo.country_code}{bankInfo.city ? `, ${bankInfo.city}` : ""}</p>
            ) : result.valid && result.bic ? (
              <p className="lab-muted">The format is valid, but this BIC isn't in our bank directory.</p>
            ) : null}
            {result.errors.length > 1 && (
              <ul>{result.errors.slice(1).map((e, i) => <li key={i}>{e}</li>)}</ul>
            )}
          </div>
        )}
      </section>

      {/* Exercises */}
      <Exercise
        id="ex-country"
        title="Exercise: Identify the country"
        prompt={<>The BIC <span className="mono">GTBINGLAXXX</span> belongs to a bank in which country?</>}
        label="Your answer (country name or code)"
        placeholder="e.g. Nigeria or NG"
        hint="The country code is characters 5–6 of the BIC."
        checkAnswer={checkCountry}
        onCorrect={() => onCheckpoint("identify-country")}
      />

      <Exercise
        id="ex-bank"
        title="Exercise: Identify the bank"
        prompt={<>The IBAN <span className="mono">GB29NWBK60161331926819</span> belongs to which bank?</>}
        label="Your answer (bank name or code)"
        placeholder="e.g. NatWest or NWBK"
        hint="Characters 5–8 of the IBAN are the bank code."
        checkAnswer={checkBank}
        onCorrect={() => onCheckpoint("identify-bank")}
      />
    </div>
  );
}
