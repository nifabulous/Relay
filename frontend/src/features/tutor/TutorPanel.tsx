import { useEffect, useRef, useState, type FormEvent } from "react";
import { apiPost, type ApiProblem } from "../../api/client";
import {
  TutorResponseSchema,
  type TutorContext,
  type TutorMode,
  type TutorRequest,
  type TutorResponse,
  type TutorTurn,
} from "../../api/schemas";
import { Button } from "../../design-system/Button";
import { contextIdentity } from "./tutorContext";
import "./TutorPanel.css";

/**
 * The reusable tutor surface.
 *
 * **No streaming — a constraint, not a preference.** The backend validates
 * citations *after* the model returns, and replaces an uncited factual answer
 * with a clarification. Text that has already streamed cannot be retracted, so
 * streaming would show the learner an answer the validator then withdraws. The
 * full validated response is committed in one go, with a determinate thinking
 * state while waiting.
 *
 * **The simulation disclaimer is panel chrome, not model output.** Asking the
 * system prompt to include it would make a standing product statement
 * contingent on model compliance — it would disappear exactly when the model is
 * behaving unusually, which is when it matters most.
 *
 * **History truncation is visible.** Silent truncation misrepresents what the
 * tutor can still see, and a learner who does not know earlier turns were
 * dropped reads a forgetful answer as a wrong one.
 *
 * Placement is entirely CSS: a right-docked drawer at ≥1024px and inline below
 * it, reusing the breakpoint where `AppShell` already swaps the rail for the
 * bottom nav. One component, one breakpoint, no JavaScript branching on width.
 */

/** Matches the backend's Pydantic cap. Sending more would 422. */
const MAX_HISTORY_TURNS = 8;
const MAX_HISTORY_CHARS = 12_000;
const MAX_HISTORY_USER_CHARS = 2_000;
const MAX_HISTORY_ASSISTANT_CHARS = 6_000;

const SIMULATION_NOTE =
  "Educational simulation — explanations only. The tutor cannot move money.";

function safeCitationUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const protocol = new URL(url).protocol;
    return protocol === "http:" || protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

export interface TutorPanelProps {
  context: TutorContext;
  initialMode?: TutorMode;
  compact?: boolean;
  /** Rendered as a heading target so a launcher can move focus here on open. */
  headingId?: string;
  /**
   * Move focus to the heading on mount.
   *
   * The panel does this itself rather than letting the launcher chase it. The
   * launcher cannot: the panel arrives through `Suspense`, so on the tick the
   * launcher opens it the heading does not exist yet. The obvious workaround —
   * poll `requestAnimationFrame` until `getElementById` finds it — passes in
   * jsdom and silently does nothing in a real browser, because rAF is not
   * serviced in a hidden or backgrounded tab. A mount effect has no timing
   * question at all: it runs when the element exists, by definition.
   */
  autoFocusHeading?: boolean;
}

interface Exchange {
  question: string;
  response: TutorResponse;
}

interface HistoryResult {
  turns: TutorTurn[];
  truncated: boolean;
}

type Phase = "idle" | "thinking" | "answered" | "failed";

function subjectOf(context: TutorContext): string {
  if (context.module_title) return context.module_title;
  if (context.rail_name && context.currency) {
    return `${context.rail_name} (${context.currency})`;
  }
  if (context.currency) return `${context.currency} payment rails`;
  if (context.tool_name) return context.tool_name;
  if (context.surface === "tracking") return "this payment timeline";
  return "cross-border payments";
}

/** Turns an HTTP failure into something a learner can act on — or not retry. */
function describeFailure(problem: ApiProblem | null): {
  message: string;
  retryable: boolean;
} {
  const status = problem?.status;
  if (status === 503) {
    /*
     * T12. Two different situations arrive as 503 and need opposite responses.
     *
     * "Not enabled" / "not configured" is a deployment fact, not a fault:
     * offering a retry invites the learner to keep trying something that can
     * never succeed. "Temporarily unavailable" is a provider blip behind a
     * circuit breaker, where retrying shortly is exactly the right move and
     * hiding the button strands them.
     *
     * Keyed on the server's own wording, which is a fixed string the router
     * owns rather than model output.
     */
    const detail = (problem?.detail ?? "").toLowerCase();
    const permanent =
      detail.includes("not enabled") ||
      detail.includes("not configured") ||
      detail.includes("requires a shared rate limit") ||
      detail.includes("requires a daily spend ceiling");
    if (permanent) {
      return {
        message:
          "The tutor is not available in this deployment. Everything else in " +
          "Relay works as usual.",
        retryable: false,
      };
    }
    return {
      message:
        "The tutor is briefly unavailable. This is a Relay-side problem, not " +
        "your question.",
      retryable: true,
    };
  }
  if (status === 429) {
    return {
      message: "Too many questions in a short time — wait a moment and ask again.",
      retryable: true,
    };
  }
  return {
    message: "That question didn't get through. It's a Relay-side problem, not your question.",
    retryable: true,
  };
}

export function TutorPanel({
  context,
  initialMode = "chat",
  compact = false,
  headingId = "tutor-panel-heading",
  autoFocusHeading = false,
}: TutorPanelProps) {
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [question, setQuestion] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [problem, setProblem] = useState<ApiProblem | null>(null);
  const [feedbackGiven, setFeedbackGiven] = useState<string | null>(null);
  const [lastAttempt, setLastAttempt] = useState<{ message: string; mode: TutorMode } | null>(
    null,
  );

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const identity = contextIdentity(context);
  const previousIdentity = useRef(identity);
  const identityRef = useRef(identity);
  const requestController = useRef<AbortController | null>(null);
  identityRef.current = identity;

  useEffect(() => {
    if (autoFocusHeading) headingRef.current?.focus();
    // Mount only. Re-focusing on a later render would yank focus out of the
    // question field while the learner is typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /*
   * Drop the conversation when the learner moves to a different resource.
   * History that follows them onto an unrelated page makes the model answer the
   * previous page's question using this page's evidence — which reads as a
   * confidently wrong answer rather than an obvious bug.
   *
   * `contextIdentity` deliberately excludes `result_summary`: a tracking
   * summary updates as events arrive, and resetting on that would clear the
   * thread every few seconds, mid-question.
   */
  useEffect(() => {
    if (previousIdentity.current !== identity) {
      requestController.current?.abort();
      requestController.current = null;
      previousIdentity.current = identity;
      setExchanges([]);
      setPhase("idle");
      setProblem(null);
      setFeedbackGiven(null);
      setLastAttempt(null);
    }
  }, [identity]);

  useEffect(() => {
    return () => {
      requestController.current?.abort();
      requestController.current = null;
    };
  }, []);

  function historyFrom(current: Exchange[]): HistoryResult {
    const exchanges: Array<[TutorTurn, TutorTurn]> = [];
    let characterCount = 0;
    let truncated = false;
    for (let index = current.length - 1; index >= 0; index -= 1) {
      const exchange = current[index];
      const pair: [TutorTurn, TutorTurn] = [
        {
          role: "user",
          content: exchange.question.slice(0, MAX_HISTORY_USER_CHARS),
        },
        {
          role: "assistant",
          content: exchange.response.answer.slice(0, MAX_HISTORY_ASSISTANT_CHARS),
        },
      ];
      const pairCharacters = pair[0].content.length + pair[1].content.length;
      if (exchanges.length > 0 && characterCount + pairCharacters > MAX_HISTORY_CHARS) {
        truncated = true;
        break;
      }
      exchanges.unshift(pair);
      characterCount += pairCharacters;
      if (exchanges.length * 2 >= MAX_HISTORY_TURNS) {
        truncated = index > 0;
        break;
      }
    }
    return { turns: exchanges.flat(), truncated };
  }

  async function send(message: string, mode: TutorMode) {
    requestController.current?.abort();
    const controller = new AbortController();
    requestController.current = controller;
    const requestIdentity = identity;

    setPhase("thinking");
    setProblem(null);
    setFeedbackGiven(null);
    setLastAttempt({ message, mode });

    const body: TutorRequest = {
      message,
      mode,
      context,
      history: historyFrom(exchanges).turns,
    };

    try {
      const response = await apiPost<TutorResponse, TutorRequest>(
        "/api/tutor/chat",
        body,
        TutorResponseSchema,
        { signal: controller.signal },
      );
      if (controller.signal.aborted || identityRef.current !== requestIdentity) return;
      setExchanges((current) => [...current, { question: message, response }]);
      setPhase("answered");
      setQuestion("");
    } catch (error) {
      if (controller.signal.aborted || identityRef.current !== requestIdentity) return;
      setProblem(error as ApiProblem);
      setPhase("failed");
    } finally {
      if (requestController.current === controller) {
        requestController.current = null;
        if (!controller.signal.aborted && identityRef.current === requestIdentity) {
          // Focus returns to the field either way. Leaving it on the button
          // strands a keyboard user on a control that has finished its job.
          inputRef.current?.focus();
        }
      }
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = question.trim();
    if (!trimmed || phase === "thinking") return;
    // A typed question uses the surface's default mode; the Explain/Hint/Quiz
    // buttons override it explicitly. This is how a surface that exists to
    // explain something (a tracking timeline, say) can make that the default
    // without the learner selecting it every time.
    void send(trimmed, initialMode);
  }

  function runMode(mode: TutorMode, prompt: string) {
    if (phase === "thinking") return;
    void send(prompt, mode);
  }

  async function sendFeedback(rating: "up" | "down", turnId: string) {
    const feedbackIdentity = identity;
    /*
     * Four bounded fields, no message text. This rides the existing telemetry
     * contract rather than a dedicated endpoint, because a second endpoint
     * would be a second place free text could be accepted.
     */
    try {
      await apiPost("/api/telemetry", [
        {
          type: "tutor_feedback",
          ts: new Date().toISOString(),
          turn_id: turnId,
          rating,
          surface: context.surface,
        },
      ]);
      if (identityRef.current === feedbackIdentity) setFeedbackGiven(rating);
    } catch {
      // Feedback is a nicety. Failing to record it must not interrupt a
      // learner who is mid-lesson.
    }
  }

  const subject = subjectOf(context);
  const truncated = historyFrom(exchanges).truncated;
  const latest = exchanges[exchanges.length - 1];
  const failure = phase === "failed" ? describeFailure(problem) : null;

  return (
    <section
      className={["tutor-panel", compact && "tutor-panel--compact"]
        .filter(Boolean)
        .join(" ")}
      aria-labelledby={headingId}
    >
      <header className="tutor-panel__header">
        <h2 className="tutor-panel__heading" id={headingId} ref={headingRef} tabIndex={-1}>
          Tutor
        </h2>
        {/* Chrome, not model output — present before any answer exists. */}
        <p className="tutor-panel__disclaimer">{SIMULATION_NOTE}</p>
      </header>

      <div className="tutor-panel__conversation" role="log" aria-live="polite">
        {exchanges.length === 0 && phase !== "thinking" && (
          <p className="tutor-panel__intro">
            Ask about <strong>{subject}</strong> — how it works, why it exists, or what a
            result means.
          </p>
        )}

        {truncated && (
          <p className="tutor-panel__truncation" role="note">
            Earlier turns in this conversation are no longer being sent to the tutor.
          </p>
        )}

        {exchanges.map((exchange) => (
          <article className="tutor-panel__exchange" key={exchange.response.turn_id}>
            <p className="tutor-panel__question">{exchange.question}</p>
            <div className="tutor-panel__answer">
              {exchange.response.needs_clarification && (
                <p className="tutor-panel__clarification" role="note">
                  <strong>Clarification needed.</strong> Confirm the relevant details before
                  relying on this explanation.
                </p>
              )}
              <p>{exchange.response.answer}</p>

              {exchange.response.safety_notice && (
                <p className="tutor-panel__safety" role="alert">
                  <strong>Safety notice.</strong> {exchange.response.safety_notice}
                </p>
              )}

              {exchange.response.citations.length > 0 && (
                <ul className="tutor-panel__sources" aria-label="Sources">
                  {exchange.response.citations.map((citation) => (
                    <li className="tutor-panel__source" key={citation.source_id}>
                      {safeCitationUrl(citation.url) ? (
                        <a
                          className="tutor-panel__source-link"
                          href={safeCitationUrl(citation.url) ?? undefined}
                          target="_blank"
                          rel="noreferrer noopener"
                        >
                          {citation.title}
                        </a>
                      ) : (
                        <span className="tutor-panel__source-name">{citation.title}</span>
                      )}
                      <span className="tutor-panel__evidence">{citation.evidence}</span>
                    </li>
                  ))}
                </ul>
              )}

              {exchange.response.citations.length === 0 &&
                !exchange.response.grounded && (
                  <p className="tutor-panel__ungrounded" role="note">
                    No Relay source backed this one, so treat it as a prompt to look
                    further rather than an answer.
                  </p>
                )}

              {exchange.response.follow_up && (
                <p className="tutor-panel__follow-up">{exchange.response.follow_up}</p>
              )}
            </div>
          </article>
        ))}

        {phase === "thinking" && (
          <p className="tutor-panel__thinking" role="status">
            Thinking…
          </p>
        )}

        {failure && (
          <div className="tutor-panel__failure" role="alert">
            <p>{failure.message}</p>
            {failure.retryable && lastAttempt && (
              <Button
                variant="secondary"
                onClick={() => void send(lastAttempt.message, lastAttempt.mode)}
              >
                Retry
              </Button>
            )}
          </div>
        )}
      </div>

      {latest && phase === "answered" && (
        <div className="tutor-panel__feedback">
          {feedbackGiven ? (
            <p className="tutor-panel__feedback-thanks">Thanks — noted.</p>
          ) : (
            <>
              <button
                type="button"
                className="tutor-panel__feedback-button"
                onClick={() => void sendFeedback("up", latest.response.turn_id)}
              >
                Helpful
              </button>
              <button
                type="button"
                className="tutor-panel__feedback-button"
                onClick={() => void sendFeedback("down", latest.response.turn_id)}
              >
                Not helpful
              </button>
            </>
          )}
        </div>
      )}

      <div className="tutor-panel__modes">
        <Button
          variant="secondary"
          onClick={() => runMode("explain", `Explain ${subject}.`)}
        >
          Explain
        </Button>
        <Button
          variant="secondary"
          onClick={() => runMode("hint", `Give me a hint about ${subject}.`)}
        >
          Hint
        </Button>
        <Button
          variant="secondary"
          onClick={() => runMode("quiz", `Quiz me on ${subject}.`)}
        >
          Quiz
        </Button>
      </div>

      <form className="tutor-panel__form" onSubmit={onSubmit}>
        <label className="tutor-panel__label" htmlFor="tutor-question">
          Ask the tutor
        </label>
        <textarea
          id="tutor-question"
          ref={inputRef}
          className="tutor-panel__input"
          value={question}
          rows={2}
          maxLength={2000}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder={`e.g. why does ${subject} work that way?`}
        />
        <Button type="submit" disabled={phase === "thinking" || !question.trim()}>
          Ask
        </Button>
      </form>
    </section>
  );
}

export default TutorPanel;
