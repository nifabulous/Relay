import { useEffect, useSyncExternalStore } from "react";
import type { TutorContext } from "../../api/schemas";
import { contextIdentity } from "./tutorContext";

/**
 * Where the current page tells the floating tutor launcher what it is looking at.
 *
 * The launcher lives in `AppShell` and has no idea what route is under it. The
 * alternative — the shell parsing the URL to work out a module ID or a currency
 * — would put a second, drifting copy of every page's routing knowledge in the
 * shell. Here the page that already holds the data supplies it, and pages that
 * have nothing to say simply say nothing.
 *
 * Module-level rather than React context, matching the preferences store in
 * `AppShell`: the publisher and the reader sit on opposite sides of the tree,
 * and threading a provider between them would mean wrapping the whole app to
 * serve one consumer.
 */

const GLOBAL_CONTEXT: TutorContext = { surface: "global" };

let current: TutorContext = GLOBAL_CONTEXT;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

/**
 * Publish this page's tutor context.
 *
 * A no-op when the context is unchanged. Pages publish from an effect, so a
 * re-render for an unrelated reason republishes — and without this the launcher
 * would re-render every time, while the panel's own identity check would see a
 * new object and drop the conversation mid-question.
 */
export function publishTutorContext(context: TutorContext): void {
  if (
    current !== GLOBAL_CONTEXT &&
    contextIdentity(current) === contextIdentity(context) &&
    current.result_summary === context.result_summary
  ) {
    return;
  }
  current = context;
  emit();
}

export function clearTutorContext(): void {
  if (current === GLOBAL_CONTEXT) return;
  current = GLOBAL_CONTEXT;
  emit();
}

/**
 * The current context, or the global surface.
 *
 * Returns a stable reference for an unchanged context: `useSyncExternalStore`
 * calls this on every render and compares by identity, so a fresh object each
 * time is an infinite re-render loop.
 */
export function readTutorContext(): TutorContext {
  return current;
}

function subscribe(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange);
  return () => {
    listeners.delete(onStoreChange);
  };
}

export function useTutorSurfaceContext(): TutorContext {
  return useSyncExternalStore(subscribe, readTutorContext, readTutorContext);
}

/**
 * Publish for as long as this page is mounted, and clear on the way out.
 *
 * Clearing matters: without it, navigating from a lesson to Overview would
 * leave the launcher advertising the lesson's context, and the tutor would
 * answer a question about the new page using the old page's grounding.
 */
export function usePublishTutorContext(context: TutorContext): void {
  const identity = contextIdentity(context);
  useEffect(() => {
    publishTutorContext(context);
    return clearTutorContext;
    // Keyed on the identity string rather than the object: the caller builds a
    // fresh context every render, so an object dependency would re-run this on
    // every render forever.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identity, context.result_summary]);
}
