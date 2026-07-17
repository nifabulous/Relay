import { render, screen } from "@testing-library/react";
import { App } from "./App";

it("renders the Relay simulation identity", () => {
  render(<App />);
  expect(screen.getByText("Relay")).toBeVisible();
  expect(screen.getByText("Educational payment simulation")).toBeVisible();
});
