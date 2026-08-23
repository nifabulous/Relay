import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import type { LabCheckpointId } from "./labTypes";

/**
 * Tracks completion checkpoints for a lab module.
 *
 * Calls `onComplete` exactly once when all required checkpoints have been
 * marked. Unknown checkpoint IDs are ignored. An empty requirement set
 * never auto-completes.
 *
 * `onCheckpointReached` fires once per distinct newly-accepted required
 * checkpoint, in acceptance order. It always invokes the latest callback
 * via a ref, so callers may pass an inline closure. Unknown checkpoint IDs
 * are filtered out before the callback fires.
 */
export function useLabCompletion(
  required: readonly LabCheckpointId[],
  onComplete: () => void,
  onCheckpointReached?: (id: LabCheckpointId) => void,
  scope?: string,
): {
  completed: ReadonlySet<LabCheckpointId>;
  markCheckpoint: (id: LabCheckpointId) => void;
} {
  const [completionState, setCompletionState] = useState(() => ({
    scope,
    completed: new Set<LabCheckpointId>(),
  }));
  // A page can stay mounted while its route changes. Expose an empty set for
  // the new scope immediately, then accept checkpoints into that scope's
  // state so completion cannot leak between modules.
  const completed = completionState.scope === scope
    ? completionState.completed
    : new Set<LabCheckpointId>();
  const hasFired = useRef(false);
  const previousScopeRef = useRef(scope);
  const onCompleteRef = useRef(onComplete);
  const onCheckpointReachedRef = useRef(onCheckpointReached);
  const reportedCheckpointIdsRef = useRef<Set<LabCheckpointId>>(new Set());

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    onCheckpointReachedRef.current = onCheckpointReached;
  }, [onCheckpointReached]);

  // Memoize the required set so markCheckpoint is stable
  const requiredSet = useMemo(() => new Set(required), [required]);

  const isReady = required.length > 0 && required.every((id) => completed.has(id));

  useEffect(() => {
    if (previousScopeRef.current === scope) return;
    previousScopeRef.current = scope;
    hasFired.current = false;
    reportedCheckpointIdsRef.current.clear();
  }, [scope]);

  useEffect(() => {
    for (const id of completed) {
      if (reportedCheckpointIdsRef.current.has(id)) continue;
      reportedCheckpointIdsRef.current.add(id);
      onCheckpointReachedRef.current?.(id);
    }
  }, [completed]);

  useEffect(() => {
    if (isReady && !hasFired.current) {
      hasFired.current = true;
      onCompleteRef.current();
    }
  }, [isReady]);

  const markCheckpoint = useCallback((id: LabCheckpointId) => {
    if (!requiredSet.has(id)) return;
    setCompletionState((prev) => {
      const current = prev.scope === scope ? prev.completed : new Set<LabCheckpointId>();
      if (current.has(id)) return prev;
      const next = new Set(current);
      next.add(id);
      return { scope, completed: next };
    });
  }, [requiredSet, scope]);

  return { completed, markCheckpoint };
}
