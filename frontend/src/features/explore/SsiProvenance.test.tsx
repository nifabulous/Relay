import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SsiProvenance } from "./SsiProvenance";

describe("SsiProvenance", () => {
  it("flags an archived instruction and shows the source date", () => {
    render(<SsiProvenance status="archived" asOf="2007-12-13" />);
    expect(screen.getByText(/Archived 2007-12-13/)).toBeInTheDocument();
  });

  it("tells the reader what to do about it", () => {
    render(<SsiProvenance status="archived" asOf="2007-12-13" />);
    expect(screen.getByTitle(/Verify against the bank before use/)).toBeInTheDocument();
  });

  it("flags unsourced illustrative data", () => {
    render(<SsiProvenance status="illustrative" />);
    expect(screen.getByText(/Illustrative/)).toBeInTheDocument();
  });

  it("stays silent for a published instruction", () => {
    const { container } = render(<SsiProvenance status="published" asOf="2026-01-01" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("stays silent when the backend sends no status at all", () => {
    const { container } = render(<SsiProvenance />);
    expect(container).toBeEmptyDOMElement();
  });
});
