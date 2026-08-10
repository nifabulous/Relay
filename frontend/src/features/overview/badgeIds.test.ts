import { describe, it, expect } from "vitest";
import { toBackendModuleId, toBackendModuleIds } from "./badgeIds";

describe("toBackendModuleId", () => {
  it("keeps current curriculum ids aligned with the backend", () => {
    expect(toBackendModuleId("lab-1")).toBe("lab-1");
    expect(toBackendModuleId("lab-8")).toBe("lab-8");
  });
  it("passes capstone and unknown ids through unchanged", () => {
    expect(toBackendModuleId("capstone")).toBe("capstone");
    expect(toBackendModuleId("fees")).toBe("fees");
  });
});

describe("toBackendModuleIds", () => {
  it("sends the composite Fees & FX module as one current module id", () => {
    expect(toBackendModuleIds("fees-fx")).toEqual(["fees-fx"]);
  });
  it("wraps single-id modules in an array", () => {
    expect(toBackendModuleIds("lab-3")).toEqual(["lab-3"]);
    expect(toBackendModuleIds("capstone")).toEqual(["capstone"]);
  });
});
