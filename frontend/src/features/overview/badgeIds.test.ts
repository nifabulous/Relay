import { describe, it, expect } from "vitest";
import { toBackendModuleId } from "./badgeIds";

describe("toBackendModuleId", () => {
  it("maps lab ids to their numeric backend id", () => {
    expect(toBackendModuleId("lab-1")).toBe("1");
    expect(toBackendModuleId("lab-8")).toBe("8");
  });
  it("passes capstone and unknown ids through unchanged", () => {
    expect(toBackendModuleId("capstone")).toBe("capstone");
    expect(toBackendModuleId("fees")).toBe("fees");
  });
});
