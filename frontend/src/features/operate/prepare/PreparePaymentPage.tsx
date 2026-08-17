import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link, useSearchParams } from "react-router-dom";
import { preparePaymentInputSchema, type PreparePaymentInput } from "./prepareSchema";
import { apiPost, apiRequest } from "../../../api/client";
import { apiKeys } from "../../../api/queryKeys";
import { PreparePaymentResponseSchema, SSIResponseSchema } from "../../../api/schemas";
import type { PreparePaymentResponse } from "../../../api/schemas";
import type { ApiProblem } from "../../../api/problem";
import type { RecommendationState } from "../../../design-system/types";
import { Button } from "../../../design-system/Button";
import { CheckResult } from "./CheckResult";
import { Recommendation } from "./Recommendation";
import { CorrespondentOptions } from "../../../design-system/correspondent-options/CorrespondentOptions";
import { groupByCurrency } from "../../explore/ssiGrouping";
import "./PreparePaymentPage.css";
import { recordActivity } from "../../../lib/persistence/storage";
import { SsiProvenance } from "../../explore/SsiProvenance";

/**
 * Currencies offered when Prepare Payment has no usable beneficiary BIC yet.
 * Once a BIC's SSI response is available, the dropdown is restricted to the
 * currencies that bank publishes for the selected SWIFT path.
 */
const COMMON_CURRENCIES = [
  "AED", "AUD", "BHD", "BRL", "CAD", "CHF", "CNY", "DKK", "EUR", "GBP",
  "HKD", "IDR", "INR", "JPY", "KES", "KRW", "KWD", "LKR", "MXN", "MYR",
  "NGN", "NOK", "NZD", "OMR", "PHP", "PKR", "QAR", "SAR", "SEK", "SGD",
  "THB", "TRY", "TWD", "USD", "XOF", "ZAR",
];

const TRACKABLE_RECOMMENDATIONS = new Set([
  "PROCEED",
  "PROCEED_WITH_CAUTION",
  "CAUTION",
]);

/** True when a string looks like a BIC worth querying SSI for. */
function isBicLike(value: string): boolean {
  return /^[A-Z0-9]{8,11}$/.test(value);
}

type CurrencyPickerProps = {
  value: string;
  options: string[];
  onChange: (currency: string) => void;
  invalid: boolean;
  describedBy?: string;
};

function CurrencyPicker({
  value,
  options,
  onChange,
  invalid,
  describedBy,
}: CurrencyPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeOption, setActiveOption] = useState(value);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  useEffect(() => {
    if (!isOpen) return;
    setActiveOption((current) => options.includes(current) ? current : options[0] ?? value);
  }, [isOpen, options, value]);

  useEffect(() => {
    if (!isOpen) return;
    optionRefs.current[activeOption]?.focus();
  }, [activeOption, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [isOpen]);

  function choose(currency: string) {
    onChange(currency);
    setActiveOption(currency);
    setIsOpen(false);
    triggerRef.current?.focus();
  }

  function moveActiveOption(direction: 1 | -1) {
    if (options.length === 0) return;
    const currentIndex = Math.max(options.indexOf(activeOption), 0);
    const nextIndex = (currentIndex + direction + options.length) % options.length;
    setActiveOption(options[nextIndex]);
  }

  function handleTriggerKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "Escape") {
      setIsOpen(false);
      return;
    }
    if (["Enter", " ", "ArrowDown", "ArrowUp"].includes(event.key)) {
      event.preventDefault();
      setActiveOption(value);
      setIsOpen(true);
    }
  }

  function handleListboxKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        moveActiveOption(1);
        break;
      case "ArrowUp":
        event.preventDefault();
        moveActiveOption(-1);
        break;
      case "Home":
        event.preventDefault();
        if (options[0]) setActiveOption(options[0]);
        break;
      case "End":
        event.preventDefault();
        if (options.at(-1)) setActiveOption(options.at(-1)!);
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        if (activeOption) choose(activeOption);
        break;
      case "Escape":
        event.preventDefault();
        setIsOpen(false);
        triggerRef.current?.focus();
        break;
    }
  }

  return (
    <div className="prepare-payment__currency-control" ref={rootRef}>
      <button
        ref={triggerRef}
        id="currency"
        type="button"
        className="prepare-payment__currency-trigger mono"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls="currency-options"
        aria-labelledby="currency-label"
        aria-invalid={invalid}
        aria-describedby={describedBy}
        value={value}
        onClick={() => {
          if (options.length === 0) return;
          setActiveOption(value);
          setIsOpen((open) => !open);
        }}
        onKeyDown={handleTriggerKeyDown}
      >
        <span>{value || "Select currency"}</span>
        <span className="prepare-payment__currency-chevron" aria-hidden="true" />
      </button>
      {isOpen && (
        <div
          id="currency-options"
          className="prepare-payment__currency-menu"
          role="listbox"
          aria-label="Currency options"
          onKeyDown={handleListboxKeyDown}
          onBlur={(event) => {
            if (!rootRef.current?.contains(event.relatedTarget as Node | null)) {
              setIsOpen(false);
            }
          }}
        >
          {options.map((currency) => (
            <button
              key={currency}
              ref={(element) => { optionRefs.current[currency] = element; }}
              type="button"
              role="option"
              className="prepare-payment__currency-option mono"
              data-value={currency}
              aria-selected={currency === value}
              tabIndex={currency === activeOption ? 0 : -1}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(currency)}
            >
              {currency}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function PreparePaymentPage() {
  const [searchParams] = useSearchParams();
  const draftBic = searchParams.get("bic") ?? "";
  const queryClient = useQueryClient();
  const [result, setResult] = useState<PreparePaymentResponse | null>(null);
  const [isStale, setIsStale] = useState(false);

  const {
    register,
    setValue,
    setError,
    getValues,
    trigger,
    formState: { errors },
    watch,
  } = useForm<PreparePaymentInput>({
    resolver: zodResolver(preparePaymentInputSchema),
    defaultValues: {
      beneficiary_iban: "",
      beneficiary_name: "",
      beneficiary_bic: draftBic,
      currency: "GBP",
      amount: NaN,
      strictness: "standard",
    },
  });

  // Published settlement currencies for the beneficiary bank: when a BIC is
  // present (pre-filled from ?bic= or typed), surface the currencies the bank
  // publishes as clickable picks that populate the currency dropdown.
  const watchedBic = watch("beneficiary_bic");
  const bicForSsi = (watchedBic ?? "").trim().toUpperCase();
  const ssiEnabled = isBicLike(bicForSsi);
  const ssiQuery = useQuery({
    queryKey: apiKeys.ssi(bicForSsi, ""),
    queryFn: () =>
      apiRequest(`/api/ssi?bic=${encodeURIComponent(bicForSsi)}`, undefined, SSIResponseSchema),
    enabled: ssiEnabled,
  });
  const publishedCurrencies = groupByCurrency(ssiQuery.data?.instructions ?? []).map(
    (g) => g.currency,
  );
  const hasLoadedBankCurrencies = ssiEnabled && !ssiQuery.isError && ssiQuery.data !== undefined;
  const hasPublishedBankCurrencies = hasLoadedBankCurrencies && publishedCurrencies.length > 0;
  const currencyOptions = hasPublishedBankCurrencies
    ? publishedCurrencies
    : COMMON_CURRENCIES;
  const currencyOptionsKey = currencyOptions.join("|");
  const selectedCurrency = watch("currency");
  const currencyTouched = useRef(false);

  function handleCurrencyChange(currency: string) {
    currencyTouched.current = true;
    setValue("currency", currency, { shouldValidate: true });
    if (result) setIsStale(true);
  }

  // Default to the bank's first published currency (importance order, so USD
  // leads) and normalize any selected value that falls outside the final
  // option set after an SSI coverage change or error.
  useEffect(() => {
    const firstOption = currencyOptions[0];
    const shouldDefaultPublished = hasPublishedBankCurrencies &&
      !currencyTouched.current &&
      selectedCurrency !== firstOption;
    const shouldNormalizeMissing = !currencyOptions.includes(selectedCurrency);

    if (firstOption && (shouldDefaultPublished || shouldNormalizeMissing)) {
      setValue("currency", firstOption, { shouldValidate: true });
      if (result && selectedCurrency !== firstOption) setIsStale(true);
    }
  }, [currencyOptionsKey, hasPublishedBankCurrencies, selectedCurrency, setValue, result]);

  const mutation = useMutation({
    mutationFn: async (data: PreparePaymentInput) => {
      const payload = {
        ...data,
        beneficiary_bic: data.beneficiary_bic || undefined,
      };
      return apiPost<PreparePaymentResponse>(
        "/api/prepare-payment",
        payload,
        PreparePaymentResponseSchema,
      );
    },
    onSuccess: (data) => { recordActivity({ type: "tool", label: "Prepare payment", at: Date.now() });
      setResult(data);
      setIsStale(false);
      // Invalidate dependent queries — progress, route, ssi, vop
      queryClient.invalidateQueries({ queryKey: apiKeys.progress });
      // Clear stale route/ssi data since inputs may have changed
      queryClient.removeQueries({ queryKey: ["route"] });
      queryClient.removeQueries({ queryKey: ["ssi"] });
      queryClient.removeQueries({ queryKey: ["vop"] });
    },
  });

  // Watch form values to detect staleness
  const formValues = watch();
  function handleInputChange() {
    if (result) setIsStale(true);
  }

  const apiError = mutation.error as ApiProblem | null;
  const isDuplicate = mutation.isPending;

  // The backend recommendation engine is authoritative — it already maps
  // NOT_CHECKED → CAUTION/STOP and no-routing → BLOCKED with correct semantics.
  // The frontend must NOT override these with "incomplete" because those are
  // valid conclusive outcomes, not missing evidence. "Incomplete" is reserved
  // for when a sub-check itself fails to run (handled by the error state).
  const recState: RecommendationState = "conclusive";
  const missingEvidence: string[] = [];

  // A payment needs to reach a bank: an IBAN (which implies a bank) or an
  // explicit BIC. With neither, block and guide. Done via setError because
  // zodResolver drops schema-level superRefine/custom issues and field-level
  // `validate` callbacks from the error state on submit.
  const requireIbanOrBic = () => {
    const iban = (getValues("beneficiary_iban") ?? "").trim();
    const bic = (getValues("beneficiary_bic") ?? "").trim();
    if (!iban && !bic) {
      setError("beneficiary_iban", {
        type: "custom",
        message: "Enter a beneficiary IBAN or account number, or a beneficiary BIC.",
      }, { shouldFocus: true });
      return false;
    }
    return true;
  };

  // Manual submit: run the schema validation, then the cross-field rule, and
  // only then call the API. handleSubmit alone cannot express the rule —
  // zodResolver replaces the error state with its own result on submit, and a
  // cross-field custom issue never reaches the field.
  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const schemaOk = await trigger();
    const crossOk = requireIbanOrBic();
    if (!schemaOk || !crossOk) return;
    mutation.mutate(getValues());
  };

  return (
    <div className="prepare-payment">
      <div className="prepare-payment__header">
        <h1>Prepare payment</h1>
        <p className="measure">
          Enter beneficiary details to validate, verify, route, and assess the payment.
        </p>
      </div>

      <aside className="prepare-payment__coverage" role="note" aria-label="Payment coverage">
        <h2>What this simulation covers</h2>
        <ul>
          <li><strong>Currency entry validation:</strong> accepts supported ISO currency codes.</li>
          <li><strong>Domestic rail catalogue:</strong> available only for markets listed in Payment Schemes.</li>
          <li><strong>International / SWIFT:</strong> provides educational routing guidance, not payment execution.</li>
          <li><strong>Bank-published settlement instructions:</strong> appear only when illustrative SSI records exist for the selected bank and currency.</li>
        </ul>
      </aside>

      {/* ── Form ───────────────────────────────────── */}
      <form
        className="prepare-payment__form"
        onSubmit={onSubmit}
        onChange={handleInputChange}
      >
        <div className="prepare-payment__field">
          <label htmlFor="beneficiary_iban">Beneficiary IBAN or account number</label>
          <input
            id="beneficiary_iban"
            type="text"
            className="mono"
            placeholder="GB29NWBK60161331926819, or a USD account number"
            {...register("beneficiary_iban")}
            aria-invalid={!!errors.beneficiary_iban}
            aria-describedby={errors.beneficiary_iban ? "beneficiary_iban-error" : undefined}
          />
          {errors.beneficiary_iban && (
            <span id="beneficiary_iban-error" className="prepare-payment__error" role="alert">{errors.beneficiary_iban.message}</span>
          )}
        </div>

        <div className="prepare-payment__field">
          <label htmlFor="beneficiary_name">Beneficiary name</label>
          <input
            id="beneficiary_name"
            type="text"
            placeholder="Account holder name"
            {...register("beneficiary_name")}
            aria-invalid={!!errors.beneficiary_name}
            aria-describedby={errors.beneficiary_name ? "beneficiary_name-error" : undefined}
          />
          {errors.beneficiary_name && (
            <span id="beneficiary_name-error" className="prepare-payment__error" role="alert">{errors.beneficiary_name.message}</span>
          )}
        </div>

        <div className="prepare-payment__row">
          <div className="prepare-payment__field">
            <label id="currency-label" htmlFor="currency">Currency</label>
            <input type="hidden" {...register("currency")} value={selectedCurrency} readOnly />
            <CurrencyPicker
              value={selectedCurrency}
              options={currencyOptions}
              invalid={!!errors.currency}
              describedBy={errors.currency ? "currency-error" : undefined}
              onChange={handleCurrencyChange}
            />
            {errors.currency && (
              <span id="currency-error" className="prepare-payment__error" role="alert">{errors.currency.message}</span>
            )}
            {ssiEnabled && ssiQuery.isError && (
              <div
                className="prepare-payment__currency-fallback"
                role="status"
                aria-label="Settlement currency coverage"
              >
                <p>
                  Bank-specific settlement instructions could not be loaded. Currencies below are simulation choices and are not confirmed for this bank.
                </p>
                <Button type="button" variant="secondary" onClick={() => void ssiQuery.refetch()}>
                  Retry settlement instructions
                </Button>
              </div>
            )}
            {ssiEnabled && hasLoadedBankCurrencies && publishedCurrencies.length === 0 && (
              <p
                className="prepare-payment__currency-fallback"
                role="status"
                aria-label="Settlement currency coverage"
              >
                No published settlement currencies are on file for this bank. Choose a currency for this simulation; current bank instructions are not confirmed.
              </p>
            )}
            {hasPublishedBankCurrencies && (
              <div className="prepare-payment__currency-picks" aria-label="Published settlement currencies">
                <span className="prepare-payment__currency-picks-label">
                  Published for this bank:
                </span>
                {publishedCurrencies.map((ccy) => (
                  <button
                    key={ccy}
                    type="button"
                    className={[
                      "prepare-payment__currency-pick",
                      ccy === selectedCurrency && "prepare-payment__currency-pick--active",
                    ].filter(Boolean).join(" ")}
                    aria-pressed={ccy === selectedCurrency}
                    onClick={() => {
                      handleCurrencyChange(ccy);
                      void trigger("currency");
                    }}
                  >
                    <span className="mono">{ccy}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="prepare-payment__field">
            <label htmlFor="amount">Amount</label>
            <input
              id="amount"
              type="number"
              step="0.01"
              min="0"
              className="mono"
              placeholder="500.00"
              {...register("amount", { valueAsNumber: true })}
              aria-invalid={!!errors.amount}
              aria-describedby={errors.amount ? "amount-error" : undefined}
            />
            {errors.amount && (
              <span id="amount-error" className="prepare-payment__error" role="alert">{errors.amount.message}</span>
            )}
          </div>
        </div>

        <div className="prepare-payment__row">
          <div className="prepare-payment__field">
            <label htmlFor="beneficiary_bic">Beneficiary BIC (optional)</label>
            <input
              id="beneficiary_bic"
              type="text"
              className="mono"
              placeholder="Auto-derived from IBAN"
              {...register("beneficiary_bic")}
            />
          </div>

          <div className="prepare-payment__field">
            <label htmlFor="strictness">Strictness</label>
            <select id="strictness" {...register("strictness")}>
              <option value="lenient">Lenient — allow close matches</option>
              <option value="standard">Standard — flag close matches</option>
              <option value="strict">Strict — block close matches</option>
            </select>
          </div>
        </div>

        <div className="prepare-payment__actions">
          <Button type="submit" variant="primary" isLoading={isDuplicate}>
            {isDuplicate ? "Checking…" : "Run payment checks"}
          </Button>
        </div>

        {apiError && (
          <div className="prepare-payment__api-error" role="alert">
            <strong>{apiError.title}</strong>
            {apiError.detail && <p>{apiError.detail}</p>}
            {Object.entries(apiError.fieldErrors).map(([field, msgs]) => (
              <p key={field}>{field}: {msgs.join(", ")}</p>
            ))}
            {apiError.retryable && (
              <Button variant="secondary" onClick={() => mutation.mutate(formValues)}>
                Retry
              </Button>
            )}
          </div>
        )}
      </form>

      {/* ── Staleness warning ──────────────────────── */}
      {isStale && result && (
        <div className="prepare-payment__stale" role="alert">
          Form inputs changed — results below are stale. Re-run checks for current values.
        </div>
      )}

      {/* ── Results ────────────────────────────────── */}
      {result && !isStale && (
        <div className="prepare-payment__results">
          <h2>Check results</h2>

          <Recommendation
            state={recState}
            recommendation={result.recommendation}
            reason={result.reason}
            isBlocking={result.is_blocking}
            warnings={result.warnings}
            blocks={result.blocks}
            missingEvidence={missingEvidence}
          />

          <p className="prepare-payment__sim-label" role="note">
            <strong>Simulation — not a real payment.</strong> This recommendation is based on illustrative data and must not be used for real payment decisions.
          </p>

          <CheckResult
            title="IBAN Validation"
            status={result.validation.valid ? "passed" : "failed"}
          >
            {result.validation.bic && (
              <p>Derived BIC: <span className="mono">{result.validation.bic}</span></p>
            )}
            {result.validation.errors.length > 0 && (
              <ul>
                {result.validation.errors.map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            )}
          </CheckResult>

          <CheckResult
            title="Verification of Payee"
            status={
              result.vop.outcome === "MATCH" ? "passed" :
              result.vop.outcome === "CLOSE_MATCH" ? "needs_attention" :
              result.vop.outcome === "NO_MATCH" ? "failed" :
              "unavailable"
            }
          >
            <p>Outcome: <strong>{result.vop.outcome}</strong></p>
            {result.vop.score !== null && result.vop.score !== undefined && (
              <p>Match score: <span className="mono">{(result.vop.score * 100).toFixed(0)}%</span></p>
            )}
            <p>{result.vop.advice}</p>
            {result.vop.outcome === "CLOSE_MATCH" && result.vop.account_holder_name && (
              <div className="prepare-payment__vop-compare">
                <p>You entered: <strong>{formValues.beneficiary_name}</strong></p>
                <p>Account holder: <strong className="mono">{result.vop.account_holder_name}</strong></p>
              </div>
            )}
          </CheckResult>

          {/* Published settlement instructions are authoritative — the bank
              named these correspondents itself. Corridor guesses are not.
              Label them differently, and never call a published instruction a
              "possible option". */}
          <CheckResult
            title={
              result.routing.routing_basis === "published-ssi"
                ? "Correspondent Routing (published)"
                : "Correspondent Routing (heuristic)"
            }
            status={
              result.routing.suggested_intermediaries.length === 0
                ? "unavailable"
                : result.routing.routing_basis === "published-ssi"
                  ? "passed"
                  : "needs_attention"
            }
          >
            {result.routing.suggested_intermediaries.length > 0 ? (
              <>
                <p>
                  {result.routing.routing_basis === "published-ssi"
                    ? `${result.routing.suggested_intermediaries.length} published correspondent(s) from the beneficiary bank's settlement instructions:`
                    : `${result.routing.suggested_intermediaries.length} possible correspondent option(s):`}
                </p>
                <ul className="prepare-payment__intermediaries">
                  {result.routing.suggested_intermediaries.map((inter, i) => (
                    <li key={i}>
                      <span className="mono">{inter.bic}</span> — {String(inter.bank ?? "Unknown")}
                      <span className="prepare-payment__confidence">{inter.confidence}</span>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p>No intermediary routing found for this corridor.</p>
            )}
          </CheckResult>

          <CheckResult
            title="Settlement Instructions (SSI)"
            status={
              result.ssi.instructions.length > 0 ? "passed" :
              result.ssi.has_placeholders_only ? "needs_attention" : "unavailable"
            }
          >
            {result.ssi.instructions.length > 0 ? (
              <>
                <p>{result.ssi.instructions.length} instruction(s) on file:</p>
                <table className="prepare-payment__ssi-table">
                  <thead>
                    <tr>
                      <th>Intermediary</th>
                      <th>BIC</th>
                      <th>Nostro Account</th>
                      <th>Charge</th>
                      <th>Value Date</th>
                      <th>Source</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.ssi.instructions.map((inst, i) => (
                      <tr key={i}>
                        <td>{String(inst.intermediary_bank_name ?? inst.intermediary_bic)}</td>
                        <td className="mono">{inst.intermediary_bic}</td>
                        <td className="mono">{inst.intermediary_account ?? "—"}</td>
                        <td>{inst.charge_code}</td>
                        <td>{inst.value_date}</td>
                        <td>
                          <SsiProvenance status={inst.status} asOf={inst.as_of} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            ) : (
              <p>No settlement instructions on file for this bank/currency.</p>
            )}
          </CheckResult>

          {/* Routing summary: preserve whether the backend returned published SSI data or a heuristic. */}
          {result.routing.suggested_intermediaries.length > 0 && (
            <div className="prepare-payment__route">
              <CorrespondentOptions
                options={result.routing.suggested_intermediaries}
                currency={result.routing.inferred_currency ?? formValues.currency}
                routingBasis={result.routing.routing_basis}
                notes={
                  result.routing.routing_basis === "published-ssi"
                    ? "These correspondents come from the beneficiary bank's published settlement instructions. Verify current details with the bank before use."
                    : "The backend provides ranked candidates, not a confirmed sequence of hops. Your bank's correspondent relationships determine the actual path."
                }
              />
            </div>
          )}

          {/* UETR and cross-links */}
          <div className="prepare-payment__footer">
            <p>
              UETR: <span className="mono">{result.uetr}</span>
            </p>
            <div className="prepare-payment__links">
              {/* The backend persists a simulated timeline only for a resolved
                  destination and a sendable recommendation, so never advertise
                  a trackable payment for a blocked or pending-review result. */}
              {result.validation.bic && TRACKABLE_RECOMMENDATIONS.has(result.recommendation) && (
                <Link to={`/operate/tracking?uetr=${result.uetr}`} className="relay-btn relay-btn--secondary">
                  Track this payment
                </Link>
              )}
              <Link to="/explore" className="relay-btn relay-btn--secondary">
                Explore corridor details
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
