import { useState, useRef, useCallback } from "react";
import type { LabContentProps } from "../labTypes";
import { mod97Remainder, mod97Steps } from "./mod97";
import { Decompose } from "../components/Decompose";
import { MultipleChoice } from "../components/MultipleChoice";
import { Button } from "../../../design-system/Button";
import { apiRequest } from "../../../api/client";
import { ValidateResponseSchema } from "../../../api/schemas";
import type { ValidateResponse } from "../../../api/schemas";
import "./LabContent.css";

const VALID_IBAN = "DE89370400440532013000";

export function Lab2Content({ moduleId, onCheckpoint }: LabContentProps) {
  const [breakInput, setBreakInput] = useState(VALID_IBAN);
  const [validResult, setValidResult] = useState<ValidateResponse | null>(null);
  const [breakResult, setBreakResult] = useState<ValidateResponse | null>(null);
  const [clientRemainder, setClientRemainder] = useState<number | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [isBreaking, setIsBreaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const validatedRef = useRef(false);
  const brokenRef = useRef(false);

  const checkValid = useCallback(async () => {
    setIsValidating(true);
    setValidResult(null);
    setError(null);
    try {
      const result = await apiRequest<ValidateResponse>(
        `/api/validate?value=${encodeURIComponent(VALID_IBAN)}`,
        undefined,
        ValidateResponseSchema,
      );
      setValidResult(result);

      // Show client-side MOD-97 for educational comparison
      const remainder = mod97Remainder(VALID_IBAN);
      setClientRemainder(remainder);

      if (!validatedRef.current) {
        validatedRef.current = true;
        onCheckpoint("validate-original");
      }
    } catch {
      setError("Could not validate this IBAN. Please try again.");
    } finally {
      setIsValidating(false);
    }
  }, [onCheckpoint]);

  const checkBroken = useCallback(async () => {
    const value = breakInput.trim();
    if (!value) return;
    setIsBreaking(true);
    setBreakResult(null);
    setError(null);
    try {
      const result = await apiRequest<ValidateResponse>(
        `/api/validate?value=${encodeURIComponent(value)}`,
        undefined,
        ValidateResponseSchema,
      );
      setBreakResult(result);

      // Show client-side remainder
      try {
        const remainder = mod97Remainder(value);
        setClientRemainder(remainder);
      } catch { /* invalid chars */ }

      if (!brokenRef.current && !result.valid) {
        brokenRef.current = true;
        onCheckpoint("break-checksum");
      }
    } catch {
      setError("Could not validate this IBAN. Please try again.");
    } finally {
      setIsBreaking(false);
    }
  }, [breakInput, onCheckpoint]);

  const steps = mod97Steps(breakInput);

  return (
    <div className="lab-content" data-module-id={moduleId}>
      <section className="lab-section">
        <h2>How IBAN checksums work: MOD-97</h2>
        <p className="measure">
          Every IBAN ends with a checksum that catches typos. The algorithm is MOD-97: the bank code
          and account number are treated as one giant number, and the remainder when divided by 97
          must equal 1. If you change a single digit, the remainder changes and the IBAN is rejected.
        </p>
        <Decompose segments={[
          { value: "DE", tone: "accent", label: "Country" },
          { value: "89", tone: "warning", label: "Checksum" },
          { value: "37040044", tone: "info", label: "Bank code" },
          { value: "0532013000", tone: "info", label: "Account" },
        ]} />
      </section>

      {/* Demo 1: Validate a known-good IBAN */}
      <section className="lab-section">
        <h2>Demo: Validate a valid-format IBAN</h2>
        <p className="measure">
          This is a valid-format German IBAN (published example). Click Check to verify it passes the MOD-97 test.
        </p>
        <p className="lab-analyzer__result">
          <span className="mono">{VALID_IBAN}</span>
        </p>
        <Button variant="primary" onClick={checkValid} isLoading={isValidating}>
          Check valid IBAN
        </Button>

        {error && <div className="lab-error" role="alert">{error}</div>}

        {validResult && (
          <div className="lab-analyzer__result">
            <p>
              Server: {validResult.valid
                ? <span className="lab-valid">Valid ✓</span>
                : <span className="lab-invalid">Invalid</span>}
            </p>
            {clientRemainder !== null && (
              <p>Client MOD-97 remainder: <span className="mono">{clientRemainder}</span>
                {" "}({clientRemainder === 1 ? "passes" : "fails — should be 1"})</p>
            )}
          </div>
        )}
      </section>

      {/* Demo 2: Break it! */}
      <section className="lab-section">
        <h2>Break it!</h2>
        <p className="measure">
          Edit the IBAN below. Change any digit and watch the checksum fail.
          The server and the client-side MOD-97 should agree.
        </p>
        <div className="lab-analyzer">
          <input
            type="text"
            className="lab-analyzer__input mono"
            aria-label="IBAN to break"
            value={breakInput}
            onChange={(e) => {
              setBreakInput(e.target.value);
              setBreakResult(null);
              setClientRemainder(null);
            }}
          />
          <Button variant="primary" onClick={checkBroken} isLoading={isBreaking}>
            Check broken IBAN
          </Button>
        </div>

        {breakResult && (
          <div className="lab-analyzer__result">
            <p>
              Server: {breakResult.valid
                ? <span className="lab-valid">Valid ✓</span>
                : <span className="lab-invalid">Invalid ✗</span>}
            </p>
            {breakResult.errors.length > 0 && (
              <ul>{breakResult.errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
            )}
            {clientRemainder !== null && (
              <p>Client MOD-97 remainder: <span className="mono">{clientRemainder}</span>
                {" "}({clientRemainder === 1 ? "passes" : "fails — should be 1"})</p>
            )}
          </div>
        )}
      </section>

      {/* Step-through: rearrange → convert → divide */}
      <section className="lab-section">
        <h2>Watch the checksum work, step by step</h2>
        <p className="measure">
          Edit the IBAN above and watch each stage update. A valid IBAN always
          leaves a remainder of exactly 1.
        </p>
        <ol className="mod97-steps">
          <li><strong>1. Move the first 4 characters to the end:</strong>{" "}
            <span className="mono">{steps.rearranged || "—"}</span></li>
          <li><strong>2. Convert letters to numbers (A=10 … Z=35):</strong>{" "}
            <span className="mono mod97-numeric">{steps.numeric || "—"}</span></li>
          <li><strong>3. Divide by 97 (processed in chunks):</strong>
            <ol className="mod97-chunks">
              {steps.chunks.map((c, i) => (
                <li key={i} className="mono">{c.chunk} mod 97 = {c.remainderAfter}</li>
              ))}
            </ol>
          </li>
          <li><strong>4. Remainder:</strong>{" "}
            <span className="mono">{steps.numeric ? steps.remainder : "—"}</span>{" "}
            {steps.numeric && (
              steps.valid
                ? <span className="lab-valid">= 1 → valid ✓</span>
                : <span className="lab-invalid">≠ 1 → invalid ✗</span>
            )}
          </li>
        </ol>
      </section>

      {/* Exercise: Find the typo */}
      <section className="lab-section">
        <h2>Exercise: Find the valid IBAN</h2>
        <p className="measure">
          One of these IBANs is valid, the other has a single typo. Use the server to check.
        </p>
        <MultipleChoice
          question="Which IBAN passes the checksum?"
          options={[
            {
              id: "valid",
              label: "GB29NWBK60161331926819",
              correct: true,
              explanation: "Correct! This IBAN has a valid MOD-97 checksum.",
            },
            {
              id: "invalid",
              label: "GB29NWBK60161331926818",
              correct: false,
              explanation: "Wrong — the last digit is changed from 9 to 8, so the checksum fails.",
            },
          ]}
          onCorrect={() => onCheckpoint("find-valid-iban")}
        />
      </section>
    </div>
  );
}
