import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LearnerDataPanel } from "./LearnerDataPanel";

const transferMocks = vi.hoisted(() => ({
  createLearningExport: vi.fn(),
  importLearningExport: vi.fn(),
  validateLearningExport: vi.fn(),
  RELAY_LEARNER_EXPORT_MAX_BYTES: 1_000_000,
}));

vi.mock("../../lib/persistence/learnerStateTransfer", () => transferMocks);

const sampleEnvelope = {
  format: "relay-learner-state" as const,
  formatVersion: 1 as const,
  exportedAt: 1_754_821_200_000,
  sourceProfileId: "imported-profile",
  state: {
    progress: {
      schemaVersion: 1 as const,
      completedModuleIds: ["lab-1", "lab-2"],
    },
    practice: {
      schemaVersion: 1 as const,
      streak: 4,
      bestStreak: 5,
      lastPracticeDay: "2026-08-10",
      missed: [{ questionId: "q-import", dueDay: "2026-08-11", misses: 2 }],
      history: [{ day: "2026-08-10", correct: 5, total: 6 }],
    },
    activity: {
      schemaVersion: 1 as const,
      entries: [{ type: "module" as const, label: "Completed Lab 2", at: 1_754_800_000_000 }],
    },
    cases: {
      "canada-us-supplier": {
        schemaVersion: 1 as const,
        caseId: "canada-us-supplier",
        status: "in_progress" as const,
        phase: "investigate" as const,
        updatedAt: "2026-08-10T10:00:00.000Z",
      },
    },
  },
};

function makeBackupFile(contents = JSON.stringify(sampleEnvelope)) {
  return new File([contents], "relay-learning-backup.json", {
    type: "application/json",
  });
}

beforeEach(() => {
  transferMocks.createLearningExport.mockReset();
  transferMocks.importLearningExport.mockReset();
  transferMocks.validateLearningExport.mockReset();
  vi.restoreAllMocks();
});

describe("LearnerDataPanel", () => {
  it("shows local-device copy, exposes the download action, and accepts json backups", async () => {
    transferMocks.createLearningExport.mockReturnValue(sampleEnvelope);
    const createObjectURL = vi.fn(() => "blob:relay-backup");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", {
      createObjectURL,
      revokeObjectURL,
    });
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const user = userEvent.setup();

    render(<LearnerDataPanel profilePersistence="persistent" />);

    expect(screen.getByText(/relay saves your learning data on this device/i)).toBeInTheDocument();
    expect(
      screen.getByText(/payment drafts and preferences are not included/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/case sessions may contain learner-entered notes/i),
    ).toBeInTheDocument();

    const fileInput = screen.getByLabelText(/choose learning backup file/i);
    expect(fileInput).toHaveAttribute("accept", "application/json,.json");

    await user.click(screen.getByRole("button", { name: /download learning backup/i }));

    expect(transferMocks.createLearningExport).toHaveBeenCalledTimes(1);
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:relay-backup");
  });

  it("shows preview counts and does not mutate learning state before confirmation", async () => {
    transferMocks.validateLearningExport.mockReturnValue({
      ok: true,
      value: sampleEnvelope,
    });
    transferMocks.importLearningExport.mockReturnValue({
      ok: true,
      report: {
        completedModulesAdded: 1,
        casesImported: 1,
        casesRetained: 0,
        activityEntriesAdded: 1,
        ignoredIds: [],
      },
    });
    const user = userEvent.setup();

    render(<LearnerDataPanel profilePersistence="persistent" />);

    await user.upload(screen.getByLabelText(/choose learning backup file/i), makeBackupFile());

    expect(await screen.findByRole("heading", { name: /backup preview/i })).toBeInTheDocument();
    expect(screen.getByText(/2 modules completed/i)).toBeInTheDocument();
    expect(screen.getByText(/1 practice history day/i)).toBeInTheDocument();
    expect(screen.getByText(/1 activity entry/i)).toBeInTheDocument();
    expect(screen.getByText(/1 case session/i)).toBeInTheDocument();
    expect(transferMocks.importLearningExport).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /import learning backup/i }));

    expect(transferMocks.importLearningExport).toHaveBeenCalledWith(sampleEnvelope);
  });

  it("clears the preview when the learner cancels the import", async () => {
    transferMocks.validateLearningExport.mockReturnValue({
      ok: true,
      value: sampleEnvelope,
    });
    const user = userEvent.setup();

    render(<LearnerDataPanel profilePersistence="persistent" />);

    await user.upload(screen.getByLabelText(/choose learning backup file/i), makeBackupFile());
    expect(await screen.findByRole("heading", { name: /backup preview/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /cancel import/i }));

    await waitFor(() => {
      expect(screen.queryByRole("heading", { name: /backup preview/i })).toBeNull();
    });
    expect(transferMocks.importLearningExport).not.toHaveBeenCalled();
  });

  it("announces import success after the learner confirms", async () => {
    transferMocks.validateLearningExport.mockReturnValue({
      ok: true,
      value: sampleEnvelope,
    });
    transferMocks.importLearningExport.mockReturnValue({
      ok: true,
      report: {
        completedModulesAdded: 1,
        casesImported: 1,
        casesRetained: 0,
        activityEntriesAdded: 1,
        ignoredIds: [],
      },
    });
    const user = userEvent.setup();

    render(<LearnerDataPanel profilePersistence="persistent" />);

    await user.upload(screen.getByLabelText(/choose learning backup file/i), makeBackupFile());
    await user.click(screen.getByRole("button", { name: /import learning backup/i }));

    expect(await screen.findByRole("status")).toHaveTextContent(
      /imported 1 new module, 1 activity entry, and 1 case session/i,
    );
  });

  it("shows an invalid-file error instead of previewing or importing", async () => {
    transferMocks.validateLearningExport.mockReturnValue({
      ok: false,
      reason: "malformed",
      message: "Import payload has an unknown format.",
    });
    const user = userEvent.setup();

    render(<LearnerDataPanel profilePersistence="persistent" />);

    await user.upload(screen.getByLabelText(/choose learning backup file/i), makeBackupFile("{}"));

    expect(await screen.findByRole("status")).toHaveTextContent(
      /import payload has an unknown format/i,
    );
    expect(screen.queryByRole("heading", { name: /backup preview/i })).toBeNull();
    expect(transferMocks.importLearningExport).not.toHaveBeenCalled();
  });

  it("rejects oversized backups before reading text or parsing json", async () => {
    const parseSpy = vi.spyOn(JSON, "parse");
    const user = userEvent.setup();
    const oversizedFile = makeBackupFile("x".repeat(transferMocks.RELAY_LEARNER_EXPORT_MAX_BYTES + 1));
    const textSpy = vi.fn(async () => {
      throw new Error("file.text should not run for oversized files");
    });
    Object.defineProperty(oversizedFile, "text", {
      value: textSpy,
    });

    render(<LearnerDataPanel profilePersistence="persistent" />);

    await user.upload(screen.getByLabelText(/choose learning backup file/i), oversizedFile);

    expect(await screen.findByRole("status")).toHaveTextContent(/backup size limit/i);
    expect(textSpy).not.toHaveBeenCalled();
    expect(parseSpy).not.toHaveBeenCalled();
    expect(transferMocks.validateLearningExport).not.toHaveBeenCalled();
  });

  it("shows a session-only warning when the local profile is not persisted", () => {
    render(<LearnerDataPanel profilePersistence="session-only" />);

    expect(
      screen.getByText(/this browser could not persist your learner profile/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/download a backup before you close this device or clear storage/i),
    ).toBeInTheDocument();
  });
});
