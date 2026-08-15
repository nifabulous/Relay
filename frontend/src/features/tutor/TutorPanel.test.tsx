import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../../test/server";
import { TutorPanel } from "./TutorPanel";
import { buildLessonContext, buildTrackingContext } from "./tutorContext";

const LESSON = buildLessonContext({
  moduleId: "lab-1",
  moduleTitle: "Identifiers: BICs & IBANs",
});

function grounded(overrides: Record<string, unknown> = {}) {
  return {
    answer: "A BIC identifies an institution; an IBAN identifies an account.",
    mode: "chat",
    grounded: true,
    turn_id: "b7a66317-f6ea-4d22-adec-b0600d67c148",
    citations: [
      {
        source_id: "relay-concept-bic",
        title: "BIC — the code that identifies a bank",
        url: null,
        evidence: "A BIC, defined by ISO 9362, identifies a financial institution",
      },
    ],
    follow_up: null,
    needs_clarification: false,
    safety_notice: "Relay is an educational SIMULATION. No real money moves.",
    ...overrides,
  };
}

function respondWith(body: unknown, status = 200) {
  server.use(
    http.post("/api/tutor/chat", () => HttpResponse.json(body as never, { status })),
  );
}

async function ask(question = "What is a BIC?") {
  const user = userEvent.setup();
  await user.type(screen.getByRole("textbox", { name: /ask the tutor/i }), question);
  await user.click(screen.getByRole("button", { name: /^ask$/i }));
  return user;
}

describe("TutorPanel — first open", () => {
  it("names what it can explain here instead of showing a welcome message", () => {
    // DESIGN.md content rules: no welcome copy. The empty state has to earn its
    // space by telling the learner what this surface's tutor actually knows.
    render(<TutorPanel context={LESSON} />);
    expect(screen.getByText(/identifiers: bics & ibans/i)).toBeVisible();
    expect(screen.queryByText(/welcome/i)).not.toBeInTheDocument();
  });

  it("offers Explain as the single primary action", () => {
    render(<TutorPanel context={LESSON} />);
    expect(screen.getByRole("button", { name: /explain/i })).toBeVisible();
  });

  it("shows the simulation disclaimer before any answer exists", () => {
    // The disclaimer is panel chrome, not model output. Rendering it only
    // alongside an answer would mean it is absent exactly while the learner is
    // forming their first impression of what this thing is.
    render(<TutorPanel context={LESSON} />);
    expect(screen.getByText(/simulation/i)).toBeVisible();
  });
});

describe("TutorPanel — answering", () => {
  it("renders a grounded answer with its citation", async () => {
    respondWith(grounded());
    render(<TutorPanel context={LESSON} />);
    await ask();
    expect(await screen.findByText(/a bic identifies an institution/i)).toBeVisible();
    expect(screen.getByText(/BIC — the code that identifies a bank/i)).toBeVisible();
  });

  it("shows the learner's own question in the conversation", async () => {
    respondWith(grounded());
    render(<TutorPanel context={LESSON} />);
    await ask("What is a BIC?");
    expect(await screen.findByText("What is a BIC?")).toBeVisible();
  });

  it("commits the whole answer at once rather than streaming it", async () => {
    // Task 2.3 validates citations AFTER the model returns and may replace an
    // uncited factual answer with a clarification. Streamed text cannot be
    // retracted, so streaming would show the learner an answer the validator
    // then withdraws.
    respondWith(grounded());
    render(<TutorPanel context={LESSON} />);
    await ask();
    const answer = await screen.findByText(/a bic identifies an institution/i);
    expect(answer.textContent).toBe(
      "A BIC identifies an institution; an IBAN identifies an account.",
    );
  });

  it("shows a thinking state while waiting", async () => {
    server.use(
      http.post("/api/tutor/chat", async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return HttpResponse.json(grounded());
      }),
    );
    render(<TutorPanel context={LESSON} />);
    await ask();
    expect(await screen.findByText(/thinking/i)).toBeVisible();
    await waitFor(() =>
      expect(screen.queryByText(/thinking/i)).not.toBeInTheDocument(),
    );
  });

  it("renders an official source as a link and a Relay card as plain text", async () => {
    respondWith(
      grounded({
        citations: [
          {
            source_id: "relay-rail-gbp-chaps",
            title: "CHAPS (GBP)",
            url: "https://www.bankofengland.co.uk/payments/chaps",
            evidence: "CHAPS is a GBP payment rail operated by the Bank of England",
          },
          {
            source_id: "relay-concept-bic",
            title: "BIC — the code that identifies a bank",
            url: null,
            evidence: "A BIC identifies a financial institution",
          },
        ],
      }),
    );
    render(<TutorPanel context={LESSON} />);
    await ask();
    const sources = await screen.findByRole("list", { name: /sources/i });
    expect(within(sources).getByRole("link", { name: /CHAPS/i })).toHaveAttribute(
      "href",
      "https://www.bankofengland.co.uk/payments/chaps",
    );
    expect(within(sources).queryByRole("link", { name: /BIC —/i })).not.toBeInTheDocument();
  });

  it("shows the evidence quote beneath each source", async () => {
    respondWith(grounded());
    render(<TutorPanel context={LESSON} />);
    await ask();
    expect(
      await screen.findByText(/A BIC, defined by ISO 9362/i),
    ).toBeVisible();
  });
});

describe("TutorPanel — modes", () => {
  it.each([
    ["explain", /explain/i],
    ["hint", /hint/i],
    ["quiz", /quiz/i],
  ])("sends mode=%s when its button is used", async (mode, label) => {
    const sent: Array<Record<string, unknown>> = [];
    server.use(
      http.post("/api/tutor/chat", async ({ request }) => {
        sent.push((await request.json()) as Record<string, unknown>);
        return HttpResponse.json(grounded({ mode }));
      }),
    );
    render(<TutorPanel context={LESSON} />);
    await userEvent.setup().click(screen.getByRole("button", { name: label }));
    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0].mode).toBe(mode);
  });

  it("sends the typed question with mode chat when Ask is used", async () => {
    const sent: Array<Record<string, unknown>> = [];
    server.use(
      http.post("/api/tutor/chat", async ({ request }) => {
        sent.push((await request.json()) as Record<string, unknown>);
        return HttpResponse.json(grounded());
      }),
    );
    render(<TutorPanel context={LESSON} />);
    await ask("Why two codes?");
    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0].mode).toBe("chat");
    expect(sent[0].message).toBe("Why two codes?");
  });
});

describe("TutorPanel — failure states", () => {
  it("explains a disabled tutor rather than showing a generic error", async () => {
    // "Off" is a deployment fact, not a fault. A red error box invites the
    // learner to retry something that will never succeed.
    respondWith({ detail: "The tutor is not enabled." }, 503);
    render(<TutorPanel context={LESSON} />);
    await ask();
    expect(await screen.findByText(/not available/i)).toBeVisible();
    expect(screen.queryByRole("button", { name: /retry/i })).not.toBeInTheDocument();
  });

  it("offers a retry on a transient failure", async () => {
    respondWith({ detail: "boom" }, 500);
    render(<TutorPanel context={LESSON} />);
    await ask();
    expect(await screen.findByRole("button", { name: /retry/i })).toBeVisible();
  });

  it("explains a rate limit in the learner's terms", async () => {
    respondWith({ detail: "Too many tutor questions in a short time." }, 429);
    render(<TutorPanel context={LESSON} />);
    await ask();
    expect(await screen.findByText(/too many|wait a moment/i)).toBeVisible();
  });

  it("renders a policy refusal as an answer, not an error", async () => {
    // The tutor handled this correctly and has a good explanation. Showing an
    // error state would tell the learner Relay is broken.
    respondWith(
      grounded({
        answer: "Relay is an educational SIMULATION — I can't settle a payment.",
        grounded: false,
        citations: [],
      }),
    );
    render(<TutorPanel context={LESSON} />);
    await ask("Settle the payment");
    expect(await screen.findByText(/can't settle a payment/i)).toBeVisible();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("flags an answer that came back without sources", async () => {
    respondWith(grounded({ grounded: false, citations: [], needs_clarification: true }));
    render(<TutorPanel context={LESSON} />);
    await ask();
    expect(await screen.findByText(/no relay source/i)).toBeVisible();
  });
});

describe("TutorPanel — conversation history", () => {
  it("sends prior turns so a follow-up makes sense", async () => {
    const sent: Array<Record<string, unknown>> = [];
    server.use(
      http.post("/api/tutor/chat", async ({ request }) => {
        sent.push((await request.json()) as Record<string, unknown>);
        return HttpResponse.json(grounded());
      }),
    );
    render(<TutorPanel context={LESSON} />);
    await ask("First question");
    await waitFor(() => expect(sent).toHaveLength(1));
    await ask("Second question");
    await waitFor(() => expect(sent).toHaveLength(2));
    expect(sent[1].history).toHaveLength(2);
  });

  it("never sends more than eight turns", async () => {
    const sent: Array<Record<string, unknown>> = [];
    server.use(
      http.post("/api/tutor/chat", async ({ request }) => {
        sent.push((await request.json()) as Record<string, unknown>);
        return HttpResponse.json(grounded());
      }),
    );
    render(<TutorPanel context={LESSON} />);
    for (let index = 0; index < 6; index += 1) {
      await ask(`Question ${index}`);
      await waitFor(() => expect(sent).toHaveLength(index + 1));
    }
    for (const body of sent) {
      expect((body.history as unknown[]).length).toBeLessThanOrEqual(8);
    }
  });

  it("says out loud when earlier turns stop being sent", async () => {
    // Silent truncation misrepresents what the tutor can still see, and a
    // learner who does not know reads a forgetful answer as a wrong one.
    const sent: Array<Record<string, unknown>> = [];
    server.use(
      http.post("/api/tutor/chat", async ({ request }) => {
        sent.push((await request.json()) as Record<string, unknown>);
        return HttpResponse.json(grounded());
      }),
    );
    render(<TutorPanel context={LESSON} />);
    for (let index = 0; index < 6; index += 1) {
      await ask(`Question ${index}`);
      await waitFor(() => expect(sent).toHaveLength(index + 1));
    }
    expect(screen.getByText(/earlier turns/i)).toBeVisible();
  });

  it("clears the conversation when the learner moves to another module", async () => {
    const sent: Array<Record<string, unknown>> = [];
    server.use(
      http.post("/api/tutor/chat", async ({ request }) => {
        sent.push((await request.json()) as Record<string, unknown>);
        return HttpResponse.json(grounded());
      }),
    );
    const { rerender } = render(<TutorPanel context={LESSON} />);
    await ask("About lab 1");
    await waitFor(() => expect(sent).toHaveLength(1));

    rerender(
      <TutorPanel
        context={buildLessonContext({ moduleId: "lab-7", moduleTitle: "Which Rail?" })}
      />,
    );
    await ask("About lab 7");
    await waitFor(() => expect(sent).toHaveLength(2));
    expect(sent[1].history).toHaveLength(0);
  });

  it("keeps the conversation when only a tracking summary updates", async () => {
    const sent: Array<Record<string, unknown>> = [];
    server.use(
      http.post("/api/tutor/chat", async ({ request }) => {
        sent.push((await request.json()) as Record<string, unknown>);
        return HttpResponse.json(grounded());
      }),
    );
    const first = buildTrackingContext({
      status: "In progress",
      eventNames: ["Created"],
      currency: "USD",
      amount: "1.00",
    });
    const { rerender } = render(<TutorPanel context={first} />);
    await ask("What does this mean?");
    await waitFor(() => expect(sent).toHaveLength(1));

    rerender(
      <TutorPanel
        context={buildTrackingContext({
          status: "In progress",
          eventNames: ["Created", "Sent to correspondent"],
          currency: "USD",
          amount: "1.00",
        })}
      />,
    );
    await ask("And now?");
    await waitFor(() => expect(sent).toHaveLength(2));
    expect((sent[1].history as unknown[]).length).toBeGreaterThan(0);
  });
});

describe("TutorPanel — feedback", () => {
  it("sends only the turn id, rating, and surface", async () => {
    const events: Array<Record<string, unknown>> = [];
    respondWith(grounded());
    server.use(
      http.post("/api/telemetry", async ({ request }) => {
        const body = (await request.json()) as Array<Record<string, unknown>>;
        events.push(...body);
        return HttpResponse.json({});
      }),
    );
    render(<TutorPanel context={LESSON} />);
    const user = await ask("What is a BIC?");
    await screen.findByText(/a bic identifies an institution/i);

    await user.click(screen.getByRole("button", { name: /^helpful$/i }));
    await waitFor(() => expect(events).toHaveLength(1));

    const event = events[0];
    expect(event.type).toBe("tutor_feedback");
    expect(event.turn_id).toBe("b7a66317-f6ea-4d22-adec-b0600d67c148");
    expect(event.rating).toBe("up");
    expect(event.surface).toBe("lesson");
    // The whole point: no route from a conversation to analytics.
    expect(JSON.stringify(event)).not.toContain("What is a BIC?");
    expect(JSON.stringify(event)).not.toContain("A BIC identifies an institution");
  });

  it("confirms the feedback was recorded", async () => {
    respondWith(grounded());
    server.use(http.post("/api/telemetry", () => HttpResponse.json({})));
    render(<TutorPanel context={LESSON} />);
    const user = await ask();
    await screen.findByText(/a bic identifies an institution/i);
    await user.click(screen.getByRole("button", { name: /not helpful/i }));
    expect(await screen.findByText(/thanks/i)).toBeVisible();
  });
});

describe("TutorPanel — accessibility", () => {
  it("labels the conversation as a live region so answers are announced", () => {
    render(<TutorPanel context={LESSON} />);
    expect(screen.getByRole("log")).toBeInTheDocument();
  });

  it("returns focus to the question field after an answer arrives", async () => {
    // Otherwise focus is stranded on a button that has done its job, and a
    // keyboard user has to tab back to continue the conversation.
    respondWith(grounded());
    render(<TutorPanel context={LESSON} />);
    await ask();
    await screen.findByText(/a bic identifies an institution/i);
    await waitFor(() =>
      expect(screen.getByRole("textbox", { name: /ask the tutor/i })).toHaveFocus(),
    );
  });

  it("does not submit an empty question", async () => {
    const calls = vi.fn();
    server.use(
      http.post("/api/tutor/chat", () => {
        calls();
        return HttpResponse.json(grounded());
      }),
    );
    render(<TutorPanel context={LESSON} />);
    await userEvent.setup().click(screen.getByRole("button", { name: /^ask$/i }));
    expect(calls).not.toHaveBeenCalled();
  });
});

describe("TutorPanel — focus on open", () => {
  it("focuses its own heading on mount when asked to", () => {
    /*
     * The panel focuses its heading itself, using a ref, on mount.
     *
     * The launcher used to do this by polling `requestAnimationFrame` until
     * `getElementById` found the heading — the panel arrives through Suspense,
     * so it is not in the DOM on the tick the launcher opens it. That worked in
     * jsdom and silently did nothing in a real browser: rAF does not fire in a
     * hidden or backgrounded tab, so anyone who opened the tutor and switched
     * away got no focus move at all. Owning it here removes the timing question
     * entirely — a mount effect runs when the element exists, by definition.
     */
    render(<TutorPanel context={LESSON} autoFocusHeading />);
    expect(screen.getByRole("heading", { name: /tutor/i })).toHaveFocus();
  });

  it("leaves focus alone when not asked to", () => {
    render(<TutorPanel context={LESSON} />);
    expect(screen.getByRole("heading", { name: /tutor/i })).not.toHaveFocus();
  });
});

// ── Review fixes: T11, T12 ──────────────────────────────────────────────────

describe("TutorPanel — conversation survival and error kinds", () => {
  it("survives a tracking poll that only changes the visible summary", async () => {
    /*
     * T11. TrackingPage polls on a schedule and rebuilds its context each time.
     * contextIdentity excludes result_summary for exactly this reason, but the
     * panel also has to not reset on the new object identity — otherwise a
     * learner mid-question loses the thread every few seconds, which reads as
     * the tutor forgetting rather than as a poll.
     */
    const sent: Array<Record<string, unknown>> = [];
    server.use(
      http.post("/api/tutor/chat", async ({ request }) => {
        sent.push((await request.json()) as Record<string, unknown>);
        return HttpResponse.json(grounded());
      }),
    );
    const first = buildTrackingContext({
      status: "In progress",
      eventNames: ["Created"],
      currency: "USD",
      amount: "1.00",
    });
    const { rerender } = render(<TutorPanel context={first} />);
    await ask("What does this mean?");
    await waitFor(() => expect(sent).toHaveLength(1));

    for (const events of [["Created", "Sent"], ["Created", "Sent", "Compliance review"]]) {
      rerender(
        <TutorPanel
          context={buildTrackingContext({
            status: "In progress",
            eventNames: events,
            currency: "USD",
            amount: "1.00",
          })}
        />,
      );
    }
    // The answer from before the polls is still on screen.
    expect(screen.getByText(/a bic identifies an institution/i)).toBeVisible();
    await ask("And now?");
    await waitFor(() => expect(sent).toHaveLength(2));
    expect((sent[1].history as unknown[]).length).toBeGreaterThan(0);
  });

  it("offers a retry for a transient outage", async () => {
    // T12. "Temporarily unavailable" and "not enabled here" both arrive as 503.
    // Treating them alike either invites a pointless retry or hides a real one.
    respondWith(
      { detail: "The tutor is temporarily unavailable. Please try again shortly." },
      503,
    );
    render(<TutorPanel context={LESSON} />);
    await ask();
    expect(await screen.findByRole("button", { name: /retry/i })).toBeVisible();
  });

  it("offers no retry when the deployment simply has no tutor", async () => {
    respondWith({ detail: "The tutor is not enabled." }, 503);
    render(<TutorPanel context={LESSON} />);
    await ask();
    expect(await screen.findByText(/not available/i)).toBeVisible();
    expect(screen.queryByRole("button", { name: /retry/i })).not.toBeInTheDocument();
  });
});
