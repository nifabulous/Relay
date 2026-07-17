import { describe, it, expect } from "vitest";
import { selectPrimaryAction } from "./selectPrimaryAction";

describe("selectPrimaryAction", () => {
  it("selects explore_intro for first-time users", () => {
    const action = selectPrimaryAction({ firstVisit: true });
    expect(action.kind).toBe("explore_intro");
    expect(action.href).toBeTruthy();
    expect(action.label).toBeTruthy();
  });

  it("selects resume_operate when operate draft is more recent than learn", () => {
    const action = selectPrimaryAction({
      unfinishedOperateAt: 20,
      unfinishedLearnAt: 10,
    });
    expect(action.kind).toBe("resume_operate");
  });

  it("selects resume_learn when learn is more recent than operate", () => {
    const action = selectPrimaryAction({
      unfinishedOperateAt: 10,
      unfinishedLearnAt: 20,
    });
    expect(action.kind).toBe("resume_learn");
  });

  it("selects next_learn when curriculum is incomplete with no active work", () => {
    const action = selectPrimaryAction({
      curriculumComplete: false,
      firstVisit: false,
    });
    expect(action.kind).toBe("next_learn");
  });

  it("selects prepare_payment when curriculum is complete", () => {
    const action = selectPrimaryAction({
      curriculumComplete: true,
      firstVisit: false,
    });
    expect(action.kind).toBe("prepare_payment");
  });

  it("prioritizes first visit over everything", () => {
    const action = selectPrimaryAction({
      firstVisit: true,
      curriculumComplete: true,
      unfinishedOperateAt: 100,
    });
    expect(action.kind).toBe("explore_intro");
  });

  it("prioritizes unfinished work over next module", () => {
    const action = selectPrimaryAction({
      unfinishedLearnAt: 50,
      curriculumComplete: false,
    });
    expect(action.kind).toBe("resume_learn");
  });
});
