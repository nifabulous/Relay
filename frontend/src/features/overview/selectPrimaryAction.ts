import type { PrimaryAction } from "../../design-system/types";

export interface OverviewContext {
  /** User has never interacted with the app */
  firstVisit?: boolean;
  /** Timestamp of the last interacted Learn module (epoch ms), undefined = none active */
  unfinishedLearnAt?: number;
  /** Timestamp of the last interacted Operate draft (epoch ms), undefined = none active */
  unfinishedOperateAt?: number;
  /** All curriculum modules completed */
  curriculumComplete?: boolean;
  /** ID of the next incomplete module */
  nextModuleId?: string;
}

/**
 * Adaptive primary action — the single dominant CTA on the Overview.
 *
 * Priority order:
 * 1. firstVisit → explore_intro
 * 2. Most recent unfinished work → resume that workspace
 * 3. Curriculum incomplete → next_learn
 * 4. Curriculum complete → prepare_payment
 */
export function selectPrimaryAction(ctx: OverviewContext): PrimaryAction {
  // 1. First visit — show the introductory explore action
  if (ctx.firstVisit) {
    return {
      kind: "explore_intro",
      href: "/explore?intro=1",
      label: "Explore how payments move",
    };
  }

  // 2. Resume the most recently active workspace
  const hasOperate = ctx.unfinishedOperateAt !== undefined;
  const hasLearn = ctx.unfinishedLearnAt !== undefined;

  if (hasOperate && hasLearn) {
    // Resume whichever was touched more recently
    if ((ctx.unfinishedOperateAt ?? 0) >= (ctx.unfinishedLearnAt ?? 0)) {
      return {
        kind: "resume_operate",
        href: "/operate",
        label: "Resume payment preparation",
      };
    }
    return {
      kind: "resume_learn",
      href: "/learn",
      label: "Continue learning",
    };
  }

  if (hasOperate) {
    return {
      kind: "resume_operate",
      href: "/operate",
      label: "Resume payment preparation",
    };
  }

  if (hasLearn) {
    return {
      kind: "resume_learn",
      href: "/learn",
      label: "Continue learning",
    };
  }

  // 3. Curriculum not yet complete — advance to next module
  if (!ctx.curriculumComplete) {
    const moduleId = ctx.nextModuleId ?? "lab-1";
    return {
      kind: "next_learn",
      href: `/app/learn/${moduleId}`,
      label: "Continue next module",
    };
  }

  // 4. Curriculum complete — offer a simulated payment
  return {
    kind: "prepare_payment",
    href: "/operate/prepare",
    label: "Prepare a simulated payment",
  };
}
