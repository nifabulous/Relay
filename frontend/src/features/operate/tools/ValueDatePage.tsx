import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiPost } from "../../../api/client";
import { ValueDateResponseSchema } from "../../../api/schemas";
import type { ValueDateResponse } from "../../../api/schemas";
import type { ApiProblem } from "../../../api/problem";
import { Button } from "../../../design-system/Button";
import "./OperateTools.css";
import { recordActivity } from "../../../lib/persistence/storage";

type WeekDayState = "settlement" | "holiday" | "non-business" | "business";

interface WeekDay {
  iso: string;
  weekday: string;
  dayOfMonth: string;
  state: WeekDayState;
  stateLabel: string;
}

function parseDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return date.getUTCFullYear() === Number(match[1])
    && date.getUTCMonth() === Number(match[2]) - 1
    && date.getUTCDate() === Number(match[3])
    ? date
    : null;
}

function toIso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, amount: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + amount);
  return next;
}

function mondayOfWeek(date: Date): Date {
  return addDays(date, -((date.getUTCDay() + 6) % 7));
}

function formatDate(value: string): string {
  const date = parseDate(value);
  if (!date) return value || "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function getWeekDays(result: ValueDateResponse): WeekDay[] | null {
  const tradeDate = parseDate(result.trade_date);
  const valueDate = parseDate(result.value_date);
  if (!tradeDate || !valueDate) return null;

  const holidayDates = new Set(
    result.skipped_holidays
      .map((holiday) => parseDate(holiday)?.toISOString().slice(0, 10))
      .filter((holiday): holiday is string => Boolean(holiday)),
  );
  // Keep the settlement marker in view when a trade rolls into a different
  // calendar week, while retaining the trade week for same-week settlements.
  const tradeWeekStart = mondayOfWeek(tradeDate);
  const valueWeekStart = mondayOfWeek(valueDate);
  const start = tradeWeekStart.getTime() === valueWeekStart.getTime()
    ? tradeWeekStart
    : valueWeekStart;
  return Array.from({ length: 7 }, (_, index) => {
    const date = addDays(start, index);
    const iso = toIso(date);
    const weekend = date.getUTCDay() === 0 || date.getUTCDay() === 6;
    const state: WeekDayState = iso === toIso(valueDate)
      ? "settlement"
      : holidayDates.has(iso)
        ? "holiday"
        : weekend
          ? "non-business"
          : "business";
    const stateLabel = state === "settlement"
      ? "Settlement date"
      : state === "holiday"
        ? "Public holiday"
        : state === "non-business"
          ? "Non-business day"
          : "Business day";
    return {
      iso,
      weekday: new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone: "UTC" }).format(date),
      dayOfMonth: new Intl.DateTimeFormat("en-GB", { day: "numeric", timeZone: "UTC" }).format(date),
      state,
      stateLabel,
    };
  });
}

export function ValueDatePage() {
  const [sendDatetime, setSendDatetime] = useState("");
  const [currency, setCurrency] = useState("GBP");
  const [scheme, setScheme] = useState("");
  const [result, setResult] = useState<ValueDateResponse | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      apiPost<ValueDateResponse>(
        "/api/value-date",
        { send_datetime: sendDatetime, currency, scheme: scheme || undefined },
        ValueDateResponseSchema,
      ),
    onSuccess: (data) => { setResult(data); recordActivity({ type: "tool", label: "Value date calculator", at: Date.now() }); },
  });

  const error = mutation.error as ApiProblem | null;
  const weekDays = result ? getWeekDays(result) : null;

  return (
    <div className="tool-page value-date-page">
      <nav className="tool-breadcrumb" aria-label="Breadcrumb">
        <span>Operate</span>
        <span aria-hidden="true">/</span>
        <span>Tools</span>
        <span aria-hidden="true">/</span>
        <span aria-current="page">Value date</span>
      </nav>

      <header className="tool-page__header">
        <h1>Value date checker</h1>
        <p className="measure">Predict settlement dates around cut-offs and holidays.</p>
      </header>

      <div className="value-date-page__layout">
        <section className="value-date-page__card value-date-page__form-card" aria-labelledby="value-date-form-heading">
          <h2 id="value-date-form-heading">Payment details</h2>
          <p className="value-date-page__supporting-copy">
            See how cut-offs, settlement schemes, and holidays change the date funds become available.
          </p>
          <form className="tool-form" onSubmit={(e) => { e.preventDefault(); if (sendDatetime) mutation.mutate(); }}>
            <div className="tool-form__field">
              <label htmlFor="vd-datetime">Payment date</label>
              <input id="vd-datetime" type="datetime-local" className="mono"
                value={sendDatetime} onChange={(e) => setSendDatetime(e.target.value)}
                aria-label="Send date and time" />
            </div>
            <div className="tool-form__field">
              <label htmlFor="vd-currency">Currency</label>
              <input id="vd-currency" type="text" className="mono" maxLength={3}
                value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                aria-label="Currency" />
            </div>
            <div className="tool-form__field">
              <label htmlFor="vd-scheme">Scheme</label>
              <input id="vd-scheme" type="text"
                value={scheme} onChange={(e) => setScheme(e.target.value)}
                placeholder="Optional — e.g. CHAPS, SEPA Instant, spot" aria-label="Scheme" />
            </div>
            <Button className="value-date-page__submit" type="submit" variant="primary" isLoading={mutation.isPending}>
              Calculate value date
            </Button>
          </form>
        </section>

        <section className="tool-result value-date-page__card value-date-page__result-card" aria-labelledby="value-date-result-heading" aria-live="polite">
          <div className="value-date-page__result-heading">
            <h2 id="value-date-result-heading" className="value-date-page__result-kicker">Expected value date</h2>
            {result ? (
              <time className="value-date-page__date mono" dateTime={result.value_date}>{formatDate(result.value_date)}</time>
            ) : (
              <p className="value-date-page__empty" role="status">Run the calculator to see an expected settlement date.</p>
            )}
          </div>

          {result && (
            <>
              <dl className="value-date-page__details">
                <div><dt>Trade date</dt><dd className="mono">{formatDate(result.trade_date)}</dd></div>
                <div><dt>Cut-off</dt><dd className="mono">{result.cut_off_local} {result.cut_off_tz}</dd></div>
                <div><dt>Holidays skipped</dt><dd>{result.skipped_holidays.length > 0 ? `${result.skipped_holidays.length} (${result.skipped_holidays.join(", ")})` : "None"}</dd></div>
                <div><dt>Business days added</dt><dd className="mono">+{result.business_days}</dd></div>
                <div><dt>Settlement type</dt><dd>{result.settlement_type}</dd></div>
                <div><dt>Missed cut-off</dt><dd><span className={`value-date-page__status ${result.missed_cut_off ? "value-date-page__status--warning" : "value-date-page__status--success"}`}><span className="value-date-page__status-dot" aria-hidden="true" />{result.missed_cut_off ? "Yes" : "No"}</span></dd></div>
              </dl>

              {weekDays && (
                <div className="value-date-page__week" aria-label="Settlement week">
                  <div className="value-date-page__week-heading">
                    <h3>Settlement week</h3>
                    <span>{formatDate(weekDays[0].iso)} – {formatDate(weekDays[6].iso)}</span>
                  </div>
                  <div className="value-date-page__week-strip" role="list" aria-label="Settlement week days">
                    {weekDays.map((day) => (
                      <div className={`value-date-page__day value-date-page__day--${day.state}`} role="listitem" key={day.iso} aria-label={`${day.weekday} ${day.dayOfMonth}: ${day.stateLabel}`}>
                        <span className="value-date-page__day-weekday">{day.weekday}</span>
                        <span className="value-date-page__day-number mono">{day.dayOfMonth}</span>
                        <span className="value-date-page__day-dot" aria-hidden="true" />
                      </div>
                    ))}
                  </div>
                  <div className="value-date-page__legend" aria-label="Settlement week legend">
                    <span><i className="value-date-page__legend-dot value-date-page__legend-dot--holiday" aria-hidden="true" />Public holiday</span>
                    <span><i className="value-date-page__legend-dot value-date-page__legend-dot--non-business" aria-hidden="true" />Non-business day</span>
                    <span><i className="value-date-page__legend-dot value-date-page__legend-dot--settlement" aria-hidden="true" />Settlement date</span>
                  </div>
                </div>
              )}

              <p className="value-date-page__explanation">{result.explanation}</p>
              <p className="tool-sim-label"><strong>Simulation — not a real payment.</strong></p>
            </>
          )}
        </section>
      </div>

      {error && (
        <div className="tool-error" role="alert">
          <strong>{error.title}</strong>
          {error.retryable && <Button variant="secondary" onClick={() => mutation.mutate()}>Retry</Button>}
        </div>
      )}
    </div>
  );
}
