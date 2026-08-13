import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { StrictMode } from "react";
import type { LabContentProps } from "./labTypes";
import {
  createTestSink,
  resetAnalyticsSink,
  setAnalyticsSink,
} from "../../lib/analytics/analytics";
import { LearnModulePage } from "./LearnModulePage";

vi.mock("./labRegistry", () => ({
  getLabDefinition: () => ({
    requiredCheckpoints: ["checkpoint-a"],
    component: ({ onCheckpoint }: LabContentProps) => (
      <button type="button" onClick={() => onCheckpoint("checkpoint-a")}>
        Reach checkpoint
      </button>
    ),
  }),
}));

function renderModule(moduleId = "lab-1", strict = false) {
  const page = (
    <MemoryRouter initialEntries={[`/learn/${moduleId}`]}>
      <Routes>
        <Route path="/learn/:moduleId" element={<LearnModulePage />} />
      </Routes>
    </MemoryRouter>
  );
  return render(strict ? <StrictMode>{page}</StrictMode> : page);
}

describe("LearnModulePage analytics", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    resetAnalyticsSink();
  });

  it("tracks the module funnel and preserves completion UI behavior", async () => {
    const sink = createTestSink();
    setAnalyticsSink(sink);
    renderModule();

    await waitFor(() => {
      expect(sink.events.slice(0, 2)).toEqual([
        { name: "module_viewed", properties: { module_id: "lab-1" } },
        { name: "module_started", properties: { module_id: "lab-1" } },
      ]);
    });
    expect(screen.queryByRole("link", { name: /Is It Real\? IBAN Checksums/i })).toBeNull();

    fireEvent.click(await screen.findByRole("button", { name: "Reach checkpoint" }));

    await waitFor(() => {
      expect(sink.events).toContainEqual({
        name: "checkpoint_reached",
        properties: { module_id: "lab-1", checkpoint_id: "checkpoint-a" },
      });
      expect(sink.events).toContainEqual({
        name: "module_completed",
        properties: { module_id: "lab-1" },
      });
    });
    expect(screen.getByRole("link", { name: /Is It Real\? IBAN Checksums/i })).toHaveAttribute(
      "href",
      "/learn/lab-2",
    );

    fireEvent.click(screen.getByRole("button", { name: "Reach checkpoint" }));
    await waitFor(() => {
      expect(sink.events.filter((event) => event.name === "checkpoint_reached")).toHaveLength(1);
      expect(sink.events.filter((event) => event.name === "module_completed")).toHaveLength(1);
    });
  });

  it("does not track a missing module", () => {
    const sink = createTestSink();
    setAnalyticsSink(sink);

    renderModule("missing");

    expect(screen.getByRole("heading", { name: "Module not found" })).toBeInTheDocument();
    expect(sink.events).toEqual([]);
  });

  it("tracks a viewed-but-locked module without a start", () => {
    const sink = createTestSink();
    setAnalyticsSink(sink);

    // lab-2 requires lab-1, which is not completed, so the module is locked.
    renderModule("lab-2");

    expect(screen.getByRole("heading", { name: /locked/i })).toBeInTheDocument();
    expect(sink.events).toEqual([
      { name: "module_viewed", properties: { module_id: "lab-2" } },
    ]);
  });

  it("keeps non-catalog ids out of module_completed payloads", async () => {
    // A tampered or legacy progress entry must never flow into telemetry even
    // when it sits in the completed list alongside a real completion; only
    // authored curriculum ids are emitted.
    localStorage.setItem(
      "relay:progress",
      JSON.stringify({ schemaVersion: 1, completedModuleIds: ["smuggled-id"] }),
    );
    const sink = createTestSink();
    setAnalyticsSink(sink);
    renderModule();

    fireEvent.click(await screen.findByRole("button", { name: "Reach checkpoint" }));

    await waitFor(() => {
      expect(sink.events).toContainEqual({
        name: "module_completed",
        properties: { module_id: "lab-1" },
      });
    });
    const payload = JSON.stringify(sink.events.map((event) => event.properties));
    expect(payload).not.toContain("smuggled-id");
  });

  it("tracks a new module when the route reuses the page", async () => {
    localStorage.setItem(
      "relay:progress",
      JSON.stringify({ schemaVersion: 1, completedModuleIds: ["lab-1"] }),
    );
    const sink = createTestSink();
    setAnalyticsSink(sink);
    renderModule();

    fireEvent.click(await screen.findByRole("link", { name: /Is It Real\? IBAN Checksums/i }));

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Is It Real? IBAN Checksums" })).toBeInTheDocument();
      expect(sink.events).toEqual([
        { name: "module_viewed", properties: { module_id: "lab-1" } },
        { name: "module_viewed", properties: { module_id: "lab-2" } },
        { name: "module_started", properties: { module_id: "lab-2" } },
      ]);
    });

    fireEvent.click(screen.getByRole("link", { name: /Identifiers: BICs & IBANs/i }));

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Identifiers: BICs & IBANs" })).toBeInTheDocument();
      expect(sink.events.at(-1)).toEqual({
        name: "module_viewed",
        properties: { module_id: "lab-1" },
      });
      expect(sink.events.filter((event) =>
        event.name === "module_viewed" && event.properties.module_id === "lab-1"
      )).toHaveLength(2);
    });
  });

  it("emits module completion once when StrictMode replays state updaters", async () => {
    const sink = createTestSink();
    setAnalyticsSink(sink);
    renderModule("lab-1", true);

    await waitFor(() => {
      expect(sink.events.filter((event) => event.name === "module_viewed")).toHaveLength(1);
      expect(sink.events.filter((event) => event.name === "module_started")).toHaveLength(1);
    });

    fireEvent.click(await screen.findByRole("button", { name: "Reach checkpoint" }));

    await waitFor(() => {
      expect(sink.events.filter((event) => event.name === "module_completed")).toHaveLength(1);
    });
  });
});
