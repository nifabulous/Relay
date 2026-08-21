import type { HTMLAttributes } from "react";
import { cn } from "@/lib/coss/cn";

/**
 * Coss card — a bounded work region. DESIGN.md gates cards on meaning: the
 * surface must be independently selectable, movable, or meaningfully bounded;
 * layout grouping alone does not justify one. Elevation is structural (thin
 * border on canvas), never a shadow.
 *
 * `cardClass` dresses router links and other elements that cannot be divs.
 * Header/content/footer subcomponents land with the first surface that needs
 * them (bundle budget: every utility in this directory ships eagerly).
 */

const CARD_BASE = "rounded-lg border border-border bg-card text-card-foreground";

export function cardClass(className?: string): string {
  return cn(CARD_BASE, className);
}

export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cardClass(className)} {...rest} />;
}
