import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { RelaySelect } from "./RelaySelect";

const options = [
  { value: "all", label: "All markets" },
  { value: "gb", label: "United Kingdom" },
];

describe("RelaySelect", () => {
  it("opens its list, changes the selected value, and labels the trigger", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(
      <RelaySelect
        ariaLabel="Market"
        value="all"
        options={options}
        onValueChange={onValueChange}
      />,
    );

    await user.click(screen.getByRole("combobox", { name: "Market" }));
    await user.click(await screen.findByRole("option", { name: "United Kingdom" }));

    expect(onValueChange).toHaveBeenCalledWith("gb");
  });
});
