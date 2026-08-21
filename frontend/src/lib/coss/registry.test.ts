import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const packageJson = JSON.parse(readFileSync(resolve(process.cwd(), "package.json"), "utf8")) as {
  dependencies?: Record<string, string>;
};
const packageLock = JSON.parse(
  readFileSync(resolve(process.cwd(), "package-lock.json"), "utf8"),
) as {
  packages: {
    "": { dependencies?: Record<string, string> };
    [packagePath: string]: { version?: string; dependencies?: Record<string, string> };
  };
};
const componentsJson = JSON.parse(readFileSync(resolve(process.cwd(), "components.json"), "utf8")) as {
  aliases?: { utils?: string };
};

function installedVersion(packageName: string): string | undefined {
  const installedPackageJson = JSON.parse(
    readFileSync(resolve(process.cwd(), "node_modules", packageName, "package.json"), "utf8"),
  ) as { version?: string };
  return installedPackageJson.version;
}

describe("Coss registry foundation", () => {
  it("exposes a dependency-light class name helper at the configured alias target", async () => {
    const { cn } = await import("./cn");

    expect(cn("px-2", false, undefined, "text-sm")).toBe("px-2 text-sm");
    expect(cn(["gap-2", null], { "items-center": true, hidden: false })).toBe(
      "gap-2 items-center",
    );
  });

  it("keeps Coss runtime dependency declarations and installs aligned", () => {
    expect(componentsJson.aliases?.utils).toBe("@/lib/coss/cn");

    for (const packageName of ["class-variance-authority", "clsx", "lucide-react"]) {
      const declaredVersion = packageJson.dependencies?.[packageName];

      expect(declaredVersion).toBeDefined();
      expect(packageLock.packages[""].dependencies?.[packageName]).toBe(declaredVersion);
      expect(packageLock.packages[`node_modules/${packageName}`]?.version).toBe(declaredVersion);
      expect(installedVersion(packageName)).toBe(declaredVersion);
    }
  });
});
