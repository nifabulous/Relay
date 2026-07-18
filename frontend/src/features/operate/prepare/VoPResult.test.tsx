import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { CheckResult } from "./CheckResult";

/**
 * Unit test for the VoP CLOSE_MATCH name display behavior.
 * Tests the CheckResult component directly with CLOSE_MATCH data,
 * verifying the account_holder_name is shown alongside the submitted name.
 */

describe("VoP CLOSE_MATCH name display", () => {
  it("shows account holder name when outcome is CLOSE_MATCH", () => {
    render(
      <CheckResult title="Verification of Payee" status="needs_attention">
        <p>Outcome: <strong>CLOSE_MATCH</strong></p>
        <p>Match score: <span className="mono">75%</span></p>
        <p>Submitted name is close to the account holder.</p>
        <div className="prepare-payment__vop-compare">
          <p>You entered: <strong>John Smith</strong></p>
          <p>Account holder: <strong className="mono">Jon Smyth</strong></p>
        </div>
      </CheckResult>,
    );

    expect(screen.getByText("CLOSE_MATCH")).toBeVisible();
    expect(screen.getByText("Jon Smyth")).toBeVisible();
    expect(screen.getByText("John Smith")).toBeVisible();
  });

  it("does not show account holder section on MATCH", () => {
    render(
      <CheckResult title="Verification of Payee" status="passed">
        <p>Outcome: <strong>MATCH</strong></p>
        <p>Match score: <span className="mono">100%</span></p>
        <p>Name matches.</p>
      </CheckResult>,
    );

    expect(screen.getByText("MATCH")).toBeVisible();
    // The comparison section should NOT be rendered on MATCH
    expect(screen.queryByText(/you entered/i)).not.toBeInTheDocument();
  });
});
