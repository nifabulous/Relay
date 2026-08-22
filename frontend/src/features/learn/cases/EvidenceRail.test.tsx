import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { EvidenceRail } from "./EvidenceRail";
import { supplierCase } from "./caseCatalog";
import type { CaseDefinition } from "./caseTypes";

function renderRail(definition: CaseDefinition = supplierCase) {
  return render(<EvidenceRail definition={definition} requestedFactIds={[]} />);
}

describe("EvidenceRail transaction review context", () => {
  it("summarizes transaction fields and renders a timeline from authored fact claims", () => {
    const definition: CaseDefinition = {
      ...supplierCase,
      facts: [
        ...supplierCase.facts,
        {
          id: "decline-code",
          label: "Decline code",
          value: "R03",
          state: "supplied",
          requestable: false,
          claim: supplierCase.facts[0].claim,
        },
        {
          id: "beneficiary-bic",
          label: "Beneficiary BIC",
          value: "SIMUBANKXXX",
          state: "supplied",
          requestable: false,
          claim: supplierCase.facts[0].claim,
        },
        {
          id: "scheme",
          label: "Scheme",
          value: "SWIFT",
          state: "supplied",
          requestable: false,
          claim: supplierCase.facts[0].claim,
        },
      ],
    };

    renderRail(definition);

    expect(screen.getByRole("heading", { name: /transaction under review/i })).toBeInTheDocument();
    expect(screen.getAllByText("USD 48,000.00").length).toBeGreaterThan(0);
    expect(screen.getAllByText("R03").length).toBeGreaterThan(0);
    expect(screen.getAllByText("SIMUBANKXXX").length).toBeGreaterThan(0);
    expect(screen.getAllByText("SWIFT").length).toBeGreaterThan(0);
    expect(screen.getByRole("heading", { name: /evidence timeline/i })).toBeInTheDocument();
    expect(screen.getAllByText("2026-02-01").length).toBeGreaterThan(0);
  });

  it("omits the timeline when no authored timestamp data exists", () => {
    const definition: CaseDefinition = {
      ...supplierCase,
      facts: supplierCase.facts.map((fact) => ({ ...fact, claim: undefined })),
    };

    renderRail(definition);

    expect(screen.queryByRole("heading", { name: /evidence timeline/i })).not.toBeInTheDocument();
  });
});
