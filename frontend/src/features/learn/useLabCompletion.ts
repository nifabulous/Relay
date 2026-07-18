import { useState, useCallback, useRef, useEffect, useMemo } from "react";
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
} {
  const [completed, setCompleted] = useState<Set<LabCheckpointId>>(new Set());
  const hasFired = useRef(false);
  const onCompleteRef = useRef(onComplete);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  // Memoize the required set so markCheckpoint is stable
  const requiredSet = useMemo(() => new Set(required), [required]);

  const isReady = required.length > 0 && required.every((id) => completed.has(id));

  useEffect(() => {
    if (isReady && !hasFired.current) {
      hasFired.current = true;
      onCompleteRef.current();
    }
  }, [isReady]);

  const markCheckpoint = useCallback((id: LabCheckpointId) => {
    if (!requiredSet.has(id)) return;
    setCompleted((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, [requiredSet]);

  return { completed, markCheckpoint };
}
