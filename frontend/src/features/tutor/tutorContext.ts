import type { TutorContext } from "../../api/schemas";

/**
 * Builders for the typed context the tutor receives.
 *
 * These are the only thing deciding what leaves the browser, so every field is
 * named explicitly. No builder spreads an object, serialises a component's
 * props, or forwards an API response — a spread would silently carry whatever
 * that object grows next, and the first anyone would know is when it appeared
 * in a prompt.
 *
 * Bounding happens here rather than at the request boundary. The API caps these
 * fields too, but a value that only fails server-side turns a long lesson title
 * into a 422 the learner sees as a broken tutor.
 */

const MAX_MODULE_TITLE = 200;
const MAX_TOPIC = 120;
const MAX_RAIL_NAME = 120;
/**
 * Deliberately far below the schema's 4000. The backend truncates to 600 before
 * the summary reaches the model anyway, so sending more would only push
 * evidence out of the prompt to no benefit.
 */
const MAX_SUMMARY = 600;
// Tracking lookup generations distinguish resources inside this tab without
// adding a transaction-shaped field to the context sent to the provider.
const localContextIdentities = new WeakMap<object, string>();

function bounded(value: string | undefined, limit: number): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.length > limit ? trimmed.slice(0, limit) : trimmed;
}

export interface LessonContextInput {
  moduleId: string;
  moduleTitle: string;
  topic?: string;
}

export function buildLessonContext(input: LessonContextInput): TutorContext {
  const context: TutorContext = {
    surface: "lesson",
    module_id: input.moduleId,
    module_title: bounded(input.moduleTitle, MAX_MODULE_TITLE),
  };
  const topic = bounded(input.topic, MAX_TOPIC);
  // Assigned conditionally rather than set to undefined: an empty string is a
  // value the backend has to interpret, absence is not.
  if (topic) context.topic = topic;
  return context;
}

export interface TrackingContextInput {
  status: string;
  eventNames: string[];
  currency: string;
  /** Client-only lookup generation; never becomes an API context field. */
  lookupKey?: string;
}

export function buildTrackingContext(input: TrackingContextInput): TutorContext {
  /*
   * Only what is already on screen. Notably absent: the UETR.
   *
   * The UETR identifies one specific transaction. The tutor explains what a
   * timeline *means* — it has no reason to know which payment produced it, and
   * the MVP performs no live lookup that would need it. Including it would put
   * a transaction reference into an external provider's logs in exchange for
   * nothing.
   *
   * Also absent: hidden or future events. The tutor explains the timeline the
   * learner can see, so that an answer never describes a step that is not on
   * their screen.
   */
  const events = input.eventNames.slice(0, 12).join(", ");
  const summary =
    `Visible status: ${input.status}. ` +
    `Currency: ${input.currency}. ` +
    `Visible events: ${events}.`;

  const context: TutorContext = {
    surface: "tracking",
    currency: bounded(input.currency, 20),
    result_summary: bounded(summary, MAX_SUMMARY),
  };
  if (input.lookupKey) {
    localContextIdentities.set(context, `tracking-lookup:${input.lookupKey}`);
  }
  return context;
}

export interface SchemeContextInput {
  currency: string;
  railName?: string;
  summary?: string;
}

export function buildSchemeContext(input: SchemeContextInput): TutorContext {
  const context: TutorContext = {
    surface: "scheme",
    currency: bounded(input.currency, 20),
  };
  const railName = bounded(input.railName, MAX_RAIL_NAME);
  if (railName) context.rail_name = railName;
  const summary = bounded(input.summary, MAX_SUMMARY);
  if (summary) context.result_summary = summary;
  return context;
}

/**
 * What makes two contexts "the same conversation".
 *
 * History is kept while this is stable and dropped when it changes. The
 * identity is the *resource*, not the whole context: `result_summary` is
 * excluded because a tracking summary updates as events arrive, and including
 * it would reset the thread every few seconds — mid-question, from the
 * learner's point of view.
 *
 * Tracking lookups add a client-only generation through `localContextIdentities`;
 * it changes for a new lookup and remains stable while that lookup polls.
 *
 * Erring the other way is worse, though: history that follows a learner onto an
 * unrelated page makes the model answer the previous page's question with this
 * page's evidence.
 */
export function contextIdentity(context: TutorContext): string {
  const baseIdentity = [
    context.surface,
    context.module_id ?? "",
    context.currency ?? "",
    context.rail_name ?? "",
    context.tool_name ?? "",
    context.case_id ?? "",
  ].join("|");
  return localContextIdentities.get(context) ?? baseIdentity;
}
