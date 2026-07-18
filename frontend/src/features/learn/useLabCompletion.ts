import { useState, useCallback, useRef, useEffect } from "react";
import type { LabCheckpointId } from "./labTypes";

/**
 * Tracks completion checkpoints for a lab module.
 *
 * Calls `onComplete` exactly once when all required checkpoints have been
 * marked. Unknown checkpoint IDs are ignored. An empty requirement set
 * never auto-completes.
 */
export function useLabCompletion(
  required: readonly LabCheckpointId[],
  onComplete: () => void,
): {
  completed: ReadonlySet<LabCheckpointId>;
  markCheckpoint: (id: LabCheckpointId) => void;
  isReady: boolean;
} {
  const [completed, setCompleted] = useState<Set<LabCheckpointId>>(new Set());
  const hasFired = useRef(false);
  const onCompleteRef = useRef(onComplete);

  // Keep the callback ref fresh without re-triggering the effect
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  const requiredSet = new Set(required);
  const isReady = required.length > 0 && required.every((id) => completed.has(id));

  // Fire onComplete when ready (once)
  useEffect(() => {
    if (isReady && !hasFired.current) {
      hasFired.current = true;
      onCompleteRef.current();
    }
  }, [isReady]);

  const markCheckpoint = useCallback((id: LabCheckpointId) => {
    if (!requiredSet.has(id)) return;
    setCompleted((prev) => {
      if (prev.has(id)) return prev; // Already marked — no duplicate
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, [requiredSet]);

  return { completed, markCheckpoint, isReady };
}
