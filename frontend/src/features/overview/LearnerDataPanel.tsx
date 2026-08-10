import { useId, useRef, useState } from "react";
import {
  createLearningExport,
  importLearningExport,
  RELAY_LEARNER_EXPORT_MAX_BYTES,
  validateLearningExport,
} from "../../lib/persistence/learnerStateTransfer";
import type {
  ProfilePersistence,
  RelayLearnerExportEnvelope,
} from "../../lib/persistence/learnerStateTypes";

interface LearnerDataPanelProps {
  profilePersistence: ProfilePersistence;
}

interface PreviewState {
  envelope: RelayLearnerExportEnvelope;
}

type FeedbackState =
  | { tone: "success" | "error"; message: string }
  | null;

function pluralize(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function describeImportResult(result: Extract<ReturnType<typeof importLearningExport>, { ok: true }>) {
  return `Imported ${pluralize(
    result.report.completedModulesAdded,
    "new module",
  )}, ${pluralize(
    result.report.activityEntriesAdded,
    "activity entry",
  )}, and ${pluralize(result.report.casesImported, "case session")}.`;
}

export function LearnerDataPanel({ profilePersistence }: LearnerDataPanelProps) {
  const inputId = useId();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [feedback, setFeedback] = useState<FeedbackState>(null);

  function resetFileInput() {
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  async function handleFileChange(event: { target: HTMLInputElement }) {
    const file = event.target.files?.[0];
    if (!file) return;

    setFeedback(null);

    try {
      if (file.size > RELAY_LEARNER_EXPORT_MAX_BYTES) {
        setPreview(null);
        setFeedback({
          tone: "error",
          message: "Import payload exceeds the Relay learner backup size limit.",
        });
        return;
      }
      const raw = await file.text();
      const parsed = JSON.parse(raw);
      const validated = validateLearningExport(parsed);

      if (!validated.ok) {
        setPreview(null);
        setFeedback({ tone: "error", message: validated.message });
        return;
      }

      setPreview({
        envelope: validated.value,
      });
    } catch {
      setPreview(null);
      setFeedback({
        tone: "error",
        message: "Relay could not read that file. Choose a valid Relay learner backup JSON file.",
      });
    }
  }

  function handleDownload() {
    const envelope = createLearningExport(Date.now());
    const blob = new Blob([JSON.stringify(envelope, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    const date = new Date(envelope.exportedAt).toISOString().slice(0, 10);
    anchor.href = url;
    anchor.download = `relay-learning-backup-${date}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function handleCancelImport() {
    setPreview(null);
    setFeedback(null);
    resetFileInput();
  }

  function handleConfirmImport() {
    if (!preview) return;

    const result = importLearningExport(preview.envelope);
    if (result.ok) {
      setFeedback({
        tone: "success",
        message: describeImportResult(result),
      });
      setPreview(null);
      resetFileInput();
      return;
    }

    setFeedback({
      tone: "error",
      message: result.message,
    });
  }

  return (
    <section className="overview__learner-data" aria-labelledby="overview-learning-backup-title">
      <div className="overview__learner-data-header">
        <div>
          <h2 id="overview-learning-backup-title" className="overview__section-title">
            Learning backup
          </h2>
          <p className="overview__muted">
            Relay saves your learning data on this device. Download a private backup before moving
            to another browser or machine.
          </p>
        </div>
        <button
          type="button"
          className="relay-btn relay-btn--secondary overview__learner-data-action"
          onClick={handleDownload}
        >
          Download learning backup
        </button>
      </div>

      <div className="overview__learner-data-body">
        <div className="overview__learner-data-copy">
          <p className="overview__learner-data-note">
            Payment drafts and preferences are not included.
          </p>
          <p className="overview__learner-data-note">
            Case sessions may contain learner-entered notes, so keep the downloaded file private.
          </p>
          {profilePersistence === "session-only" && (
            <div className="overview__learner-data-warning">
              <p className="overview__learner-data-warning-title">
                This browser could not persist your learner profile.
              </p>
              <p className="overview__learner-data-warning-copy">
                Download a backup before you close this device or clear storage.
              </p>
            </div>
          )}
        </div>

        <div className="overview__learner-data-import">
          <label htmlFor={inputId} className="overview__learner-data-label">
            Choose learning backup file
          </label>
          <input
            ref={fileInputRef}
            id={inputId}
            type="file"
            accept="application/json,.json"
            className="overview__learner-data-input"
            onChange={handleFileChange}
          />

          {preview && (
            <div className="overview__learner-data-preview">
              <h3 className="overview__learner-data-preview-title">Backup preview</h3>
              <ul className="overview__learner-data-preview-list">
                <li>{pluralize(preview.envelope.state.progress.completedModuleIds.length, "module")} completed</li>
                <li>{pluralize(preview.envelope.state.practice.history.length, "practice history day")}</li>
                <li>{pluralize(preview.envelope.state.activity.entries.length, "activity entry")}</li>
                <li>{pluralize(Object.keys(preview.envelope.state.cases).length, "case session")}</li>
              </ul>
              <div className="overview__learner-data-actions">
                <button
                  type="button"
                  className="relay-btn relay-btn--primary"
                  onClick={handleConfirmImport}
                >
                  Import learning backup
                </button>
                <button
                  type="button"
                  className="relay-btn relay-btn--secondary"
                  onClick={handleCancelImport}
                >
                  Cancel import
                </button>
              </div>
            </div>
          )}

          {feedback && (
            <p
              className={`overview__learner-data-feedback overview__learner-data-feedback--${feedback.tone}`}
              role="status"
              aria-live="polite"
            >
              {feedback.message}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
