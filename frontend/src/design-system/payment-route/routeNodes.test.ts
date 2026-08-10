import { describe, expect, it } from "vitest";
import { buildRouteNodes } from "./routeNodes";

describe("buildRouteNodes", () => {
  it("brackets intermediaries between an originator and the beneficiary", () => {
    const nodes = buildRouteNodes(
      [{ bic: "CITIUS33", bank: "Citibank NY" }],
      "SBININBBXXX",
    );

    expect(nodes.map((n) => n.kind)).toEqual([
      "originator",
      "intermediary",
      "beneficiary",
    ]);
    expect(nodes[1].bic).toBe("CITIUS33");
    expect(nodes[1].name).toBe("Citibank NY");
    expect(nodes[2].bic).toBe("SBININBBXXX");
  });

  it("preserves intermediary order for a multi-hop chain", () => {
    const nodes = buildRouteNodes(
      [
        { bic: "CITIUS33", bank: "Citibank NY" },
        { bic: "DEUTDEFF", bank: "Deutsche Bank" },
      ],
      "SBININBBXXX",
    );

    expect(nodes.map((n) => n.bic)).toEqual([
      "—",
      "CITIUS33",
      "DEUTDEFF",
      "SBININBBXXX",
    ]);
  });

  it("falls back to the BIC when an intermediary carries no name", () => {
    const nodes = buildRouteNodes([{ bic: "DEUTDEFF" }], "SBININBBXXX");

    expect(nodes[1].name).toBe("DEUTDEFF");
  });

  it("returns only the endpoints when there are no intermediaries", () => {
    const nodes = buildRouteNodes([], "SBININBBXXX");

    expect(nodes.map((n) => n.kind)).toEqual(["originator", "beneficiary"]);
  });
});