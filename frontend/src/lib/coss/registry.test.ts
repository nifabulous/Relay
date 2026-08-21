import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const packageJson = JSON.parse(readFileSync(resolve(process.cwd(), "package.json"), "utf8")) as {
  dependencies?: Record<string, string>;
};
const componentsJson = JSON.parse(readFileSync(resolve(process.cwd(), "components.json"), "utf8")) as {
  aliases?: { utils?: string };
};

describe("Coss registry foundation", () => {
  it("exposes a dependency-light class name helper at the configured alias target", async () => {
    const { cn } = await import("./cn");

    expect(cn("px-2", false, undefined, "text-sm")).toBe("px-2 text-sm");
  });

  it("pins the runtime dependencies used by the Coss Button registry item", () => {
    expect(componentsJson.aliases?.utils).toBe("@/lib/coss/cn");
    expect(packageJson.dependencies?.["class-variance-authority"]).toMatch(/^\d+\.\d+\.\d+$/);
    expect(packageJson.dependencies?.["lucide-react"]).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
