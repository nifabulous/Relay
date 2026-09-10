import type { PrimaryAction } from "../../design-system/types";

export type ActionCopy = {
  title: string;
  supporting: string;
  cta: string;
};

/**
 * Copy contract from the spec — deterministic title, supporting line, and CTA
 * label per action kind. Do not invent per-state marketing language here.
 */
export const ACTION_COPY: Record<PrimaryAction["kind"], ActionCopy> = {
  explore_intro: {
    title: "Explore how payments move",
    supporting: "Start with an illustrative payment flow.",
    cta: "Explore how payments move",
  },
  resume_learn: {
    title: "Resume your lesson",
    supporting: "Pick up where you left off.",
    cta: "Resume lesson",
  },
  next_learn: {
    title: "Continue to the next module",
    supporting: "Build on your progress with the next lesson.",
    cta: "Continue learning",
  },
  resume_operate: {
    title: "Finish your payment draft",
    supporting: "Your prepared payment is still open.",
    cta: "Resume payment",
  },
  prepare_payment: {
    title: "Prepare a simulated payment",
    supporting: "Put the curriculum to work on a full route.",
    cta: "Prepare a payment",
  },
};

/** Short stage label for the action's eyebrow pill. */
export const ACTION_STAGE: Record<PrimaryAction["kind"], string> = {
  explore_intro: "Start here",
  resume_learn: "Resume lesson",
  next_learn: "Next module",
  resume_operate: "Resume draft",
  prepare_payment: "Prepare payment",
};

export type WorkspaceLink = {
  to: string;
  label: string;
  description: string;
  icon: "book" | "repeat" | "grid" | "search" | "building" | "route" | "creditCard" | "sliders";
};

export type Workspace = {
  name: "Learn" | "Explore" | "Operate";
  description: string;
  icon: WorkspaceLink["icon"];
  links: WorkspaceLink[];
};

/** Destinations are grouped by the workspace they actually open. */
export const WORKSPACES: Workspace[] = [
  {
    name: "Learn",
    description: "Cases, labs, and daily practice.",
    icon: "book",
    links: [
      { to: "/learn", label: "Continue learning", description: "Case desk and technical labs", icon: "book" },
      { to: "/learn/practice", label: "Practice", description: "Run today’s drill", icon: "repeat" },
      { to: "/explore/glossary", label: "Glossary", description: "Look up payment terms", icon: "grid" },
    ],
  },
  {
    name: "Explore",
    description: "Reference data behind the simulation.",
    icon: "search",
    links: [
      { to: "/explore", label: "Search", description: "Find banks, corridors, and terms", icon: "search" },
      { to: "/explore/banks", label: "Directory", description: "Browse banks", icon: "building" },
      { to: "/explore/schemes", label: "Payment schemes", description: "Compare domestic rails", icon: "route" },
    ],
  },
  {
    name: "Operate",
    description: "Run a simulated payment end to end.",
    icon: "sliders",
    links: [
      { to: "/operate/prepare", label: "Prepare a payment", description: "Validate, route, and check", icon: "creditCard" },
      { to: "/operate/tracking", label: "Track a payment", description: "Follow a simulated gpi timeline", icon: "route" },
      { to: "/operate/tools", label: "Payment tools", description: "Fees, screening, value date, STP", icon: "sliders" },
    ],
  },
];

export type PlanItem = {
  key: string;
  label: string;
  to: string;
  state: "Due" | "Up next" | "Done";
};

/** Today's plan is derived from learner state, never padded with filler rows. */
export function buildPlan(input: {
  reviewsDue: number;
  practiceDone: boolean;
  nextModuleTitle: string | null;
  nextModuleHref: string | null;
  curriculumComplete: boolean;
}): PlanItem[] {
  const plan: PlanItem[] = [];

  if (input.reviewsDue > 0) {
    plan.push({
      key: "reviews",
      label: `Review ${input.reviewsDue} question${input.reviewsDue === 1 ? "" : "s"} due for review`,
      to: "/learn/practice",
      state: "Due",
    });
  }

  plan.push({
    key: "practice",
    label: input.practiceDone ? "Daily drill complete" : "Run today’s drill",
    to: "/learn/practice",
    state: input.practiceDone ? "Done" : "Up next",
  });

  if (input.nextModuleTitle && input.nextModuleHref) {
    plan.push({
      key: "module",
      label: `Study ${input.nextModuleTitle}`,
      to: input.nextModuleHref,
      state: "Up next",
    });
  }

  if (input.curriculumComplete) {
    plan.push({
      key: "prepare",
      label: "Prepare a simulated payment",
      to: "/operate/prepare",
      state: "Up next",
    });
  }

  return plan;
}
