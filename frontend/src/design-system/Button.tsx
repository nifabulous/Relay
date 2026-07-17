import { type ButtonHTMLAttributes, forwardRef } from "react";
import "./Button.css";

type Variant = "primary" | "secondary" | "danger";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  isLoading?: boolean;
}

const variantClass: Record<Variant, string> = {
  primary: "relay-btn--primary",
  secondary: "relay-btn--secondary",
  danger: "relay-btn--danger",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", isLoading = false, className = "", children, disabled, ...rest },
  ref,
) {
  const classes = ["relay-btn", variantClass[variant], isLoading && "relay-btn--loading", className]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      ref={ref}
      className={classes}
      aria-busy={isLoading || undefined}
      disabled={disabled || isLoading}
      {...rest}
    >
      {isLoading && <span className="relay-btn__spinner" aria-hidden="true" />}
      {children}
    </button>
  );
});
