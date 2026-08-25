import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/coss/cn";

/**
 * Coss switch — a native checkbox drawn as a switch.
 *
 * Deliberately not a Base UI Switch: the control must keep `role="checkbox"`
 * (the settings suite drives these controls by that role) and stay a real
 * form control. The input covers the track and stays focusable; the visual
 * layer is a peer sibling, so keyboard focus rings and checked styling work
 * without duplicating state. Both states are always visible — an unchecked
 * switch renders the same track with the thumb at rest, never nothing
 * (DESIGN.md: status carries text, icon and colour together).
 */

export interface SwitchProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  className?: string;
}

export function Switch({ className, ...rest }: SwitchProps) {
  return (
    <span className={cn("relative inline-block h-5 w-9 shrink-0 align-middle", className)}>
      <input
        type="checkbox"
        className="peer absolute inset-0 h-full w-full cursor-pointer opacity-0"
        {...rest}
      />
      <span
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute inset-0 rounded-full border border-[var(--color-border-strong)]",
          "bg-[var(--color-surface-3)] transition-colors duration-[var(--duration-fast)] ease-[var(--ease)]",
          "after:absolute after:left-[2px] after:top-1/2 after:h-4 after:w-4 after:-translate-y-1/2",
          "after:rounded-full after:border after:border-[var(--color-border-strong)] after:bg-[var(--color-surface)]",
          "after:transition-transform after:duration-[var(--duration-fast)] after:ease-[var(--ease)] after:content-['']",
          "peer-checked:border-primary peer-checked:bg-primary peer-checked:after:translate-x-4",
          "peer-checked:after:border-primary",
          "peer-disabled:cursor-not-allowed peer-disabled:opacity-55",
          "peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring",
        )}
      />
    </span>
  );
}
