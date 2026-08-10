import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../../../test/server";
import { Lab1Content } from "./Lab1Content";
import { Lab3Content } from "./Lab3Content";
import { Lab4Content } from "./Lab4Content";
import { Lab5Content } from "./Lab5Content";
import { Lab6Content } from "./Lab6Content";

// Helper: render a lab with checkpoint spy
function renderLab(Component: React.ComponentType<{ moduleId: string; isComplete: boolean; onCheckpoint: (id: string) => void }>) {
  const onCheckpoint = vi.fn();
  const user = userEvent.setup();
  const utils = render(<Component moduleId="test" isComplete={false} onCheckpoint={onCheckpoint} />);
  return { user, onCheckpoint, ...utils };
}

describe("Lab 1 API error handling", () => {
  it("shows error and does not emit checkpoint on validate failure", async () => {
    server.use(
      http.get("/api/validate", () => HttpResponse.json({ detail: "Server error" }, { status: 500 })),
    );

    const { user, onCheckpoint } = renderLab(Lab1Content);
    await user.type(screen.getByPlaceholderText(/enter a BIC or IBAN/i), "CITIUS33");
    await user.click(screen.getByRole("button", { name: /analyze/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeVisible();
    });
    expect(onCheckpoint).not.toHaveBeenCalledWith("analyze-identifier");
  });
});

describe("Lab 3 API error handling", () => {
  it("shows error and does not emit checkpoint on verify-payee failure", async () => {
    server.use(
      http.post("/api/verify-payee", () => HttpResponse.json({ detail: "Server error" }, { status: 500 })),
    );

    const { user, onCheckpoint } = renderLab(Lab3Content);
    await user.click(screen.getByRole("button", { name: /use exact match.*fills john smith/i }));
    await user.click(screen.getByRole("button", { name: "Verify payee" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeVisible();
    });
    expect(onCheckpoint).not.toHaveBeenCalledWith("run-match");
  });
});

describe("Lab 4 API error handling", () => {
  it("shows error and does not emit checkpoint on route failure", async () => {
    server.use(
      http.get("/api/route", () => HttpResponse.json({ detail: "Server error" }, { status: 500 })),
    );

    const { user, onCheckpoint } = renderLab(Lab4Content);
    await user.click(screen.getByRole("button", { name: /find.*intermediar/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeVisible();
    });
    expect(onCheckpoint).not.toHaveBeenCalledWith("route-demo");
  });
});

describe("Lab 5 API error handling", () => {
  it("shows error and does not emit checkpoint on SSI failure", async () => {
    server.use(
      http.get("/api/ssi", () => HttpResponse.json({ detail: "Server error" }, { status: 500 })),
    );

    const { user, onCheckpoint } = renderLab(Lab5Content);
    await user.click(screen.getByRole("button", { name: /show.*instructions/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeVisible();
    });
    expect(onCheckpoint).not.toHaveBeenCalledWith("lookup-ssi");
  });
});

describe("Lab 6 API error handling", () => {
  it("shows error and does not emit checkpoint on track/create failure", async () => {
    server.use(
      http.post("/api/track/create", () => HttpResponse.json({ detail: "Server error" }, { status: 500 })),
    );

    const { user, onCheckpoint } = renderLab(Lab6Content);
    await user.click(screen.getByRole("button", { name: /create.*track/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeVisible();
    });
    expect(onCheckpoint).not.toHaveBeenCalledWith("create-payment");
  });
});
