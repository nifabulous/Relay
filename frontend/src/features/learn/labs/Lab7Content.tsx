import { useState, useRef, useCallback } from "react";
import type { LabContentProps } from "../labTypes";
import { MultipleChoice } from "../components/MultipleChoice";
import { apiRequest } from "../../../api/client";
import { SchemesResponseSchema } from "../../../api/schemas";
import type { SchemesResponse } from "../../../api/schemas";
import { SCHEME_SCENARIOS } from "./schemeScenarios";
import "./LabContent.css";

const CURRENCIES = ["GBP", "CAD", "USD", "EUR", "NGN", "KES", "INR", "AUD", "JPY", "AED"];

export function Lab7Content({ moduleId, onCheckpoint }: LabContentProps) {
  const [selectedCurrency, setSelectedCurrency] = useState<string | null>(null);
  const [schemes, setSchemes] = useState<SchemesResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadedRef = useRef(false);
  const correctScenarios = useRef(new Set<string>());
  const allDoneRef = useRef(false);

  const loadSchemes = useCallback(async (currency: string) => {
    setSelectedCurrency(currency);
    setIsLoading(true);
    setError(null);
    setSchemes(null);

    try {
      const result = await apiRequest<SchemesResponse>(
        `/api/schemes?currency=${encodeURIComponent(currency)}`,
        undefined,
        SchemesResponseSchema,
      );
      setSchemes(result);

      if (!loadedRef.current) {
        loadedRef.current = true;
        onCheckpoint("load-schemes");
      }
    } catch {
      setError("Could not load schemes for this currency. Please try another.");
    } finally {
      setIsLoading(false);
    }
  }, [onCheckpoint]);

  const handleScenarioCorrect = useCallback((scenarioId: string) => {
    correctScenarios.current.add(scenarioId);

    if (!allDoneRef.current && correctScenarios.current.size === SCHEME_SCENARIOS.length) {
      allDoneRef.current = true;
      onCheckpoint("complete-seven-scenarios");
    }
  }, [onCheckpoint]);

  return (
    <div className="lab-content" data-module-id={moduleId}>
      <section className="lab-section">
        <h2>One currency, many rails</h2>
        <p className="measure">
          Every currency has multiple payment rails — domestic systems that move money
          between banks. Each rail has different <strong>speed</strong>, <strong>cost</strong>,
          and <strong>limits</strong>. Choosing the right rail is a core payment-ops skill.
        </p>
        <p className="measure">
          <strong>Golden rule:</strong> Speed costs money. Instant payments cost more than
          batch payments. High-value payments cost more than retail.
        </p>
      </section>

      {/* Currency picker */}
      <section className="lab-section">
        <h2>Explore payment schemes</h2>
        <p className="measure">Select a currency to see its available payment rails.</p>
        <div className="lab-currency-pills">
          {CURRENCIES.map((ccy) => (
            <button
              key={ccy}
              type="button"
              className={[
                "lab-currency-pill",
                selectedCurrency === ccy && "lab-currency-pill--active",
              ].filter(Boolean).join(" ")}
              onClick={() => loadSchemes(ccy)}
              disabled={isLoading}
              aria-pressed={selectedCurrency === ccy}
            >
              {ccy}
            </button>
          ))}
        </div>

        {error && <div className="lab-error" role="alert">{error}</div>}

        {schemes && schemes.schemes.length > 0 && (
          <div className="lab-scheme-grid">
            {schemes.schemes.map((scheme) => (
              <div key={scheme.name} className="lab-scheme-card">
                <h4>{scheme.name}</h4>
                <span className="lab-scheme-card__speed">{scheme.speed}</span>
                <dl>
                  <dt>Limit</dt><dd>{scheme.limit}</dd>
                  <dt>Cost</dt><dd>{scheme.cost}</dd>
                  <dt>Use case</dt><dd>{scheme.useCase}</dd>
                  <dt>Operator</dt><dd>{scheme.operator}</dd>
                </dl>
              </div>
            ))}
          </div>
        )}

        {schemes && schemes.schemes.length === 0 && (
          <p className="lab-muted">No schemes data available for {selectedCurrency}.</p>
        )}
      </section>

      {/* Seven scenario quizzes */}
      <section className="lab-section">
        <h2>Scenario quiz: Pick the right rail</h2>
        <p className="measure">
          Answer all seven scenarios. Each tests a different real-world payment decision.
        </p>
        {SCHEME_SCENARIOS.map((scenario) => (
          <MultipleChoice
            key={scenario.id}
            question={scenario.question}
            options={scenario.options}
            onCorrect={() => handleScenarioCorrect(scenario.id)}
          />
        ))}
      </section>
    </div>
  );
}
