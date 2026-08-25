import type { ReactNode } from "react";
import { cn } from "@/lib/coss/cn";

/**
 * Coss field text — the muted description line under a control.
 *
 * Association stays explicit (htmlFor / aria-describedby) rather than implicit
 * nesting: wrapping the description inside the label would fold it into the
 * accessible name (the same reasoning SettingsPage documents). Input,
 * textarea, label and error variants land with the first form surface that
 * adopts them — the app-wide input baseline lives in global.css meanwhile.
 */

export interface FieldDescriptionProps {
  id?: string;
  className?: string;
  children: ReactNode;
}

export function FieldDescription({ id, className, children }: FieldDescriptionProps) {
  return (
    <p id={id} className={cn("text-sm leading-normal text-muted-foreground", className)}>
      {children}
    </p>
  );
}
