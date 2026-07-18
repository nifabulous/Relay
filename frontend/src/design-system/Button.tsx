import { type ButtonHTMLAttributes, type AnchorHTMLAttributes, forwardRef } from "react";
import "./Button.css";

type Variant = "primary" | "secondary" | "danger";

interface ButtonAsButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  isLoading?: boolean;
  as?: "button";
}

interface ButtonAsAnchorProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  variant?: Variant;
  isLoading?: boolean;
  as: "a";
}

type ButtonProps = ButtonAsButtonProps | ButtonAsAnchorProps;

const variantClass: Record<Variant, string> = {
  primary: "relay-btn--primary",
  secondary: "relay-btn--secondary",
  danger: "relay-btn--danger",
};

export const Button = forwardRef<HTMLButtonElement | HTMLAnchorElement, ButtonProps>(
  function Button({ variant = "primary", isLoading = false, className = "", children, ...rest }, ref) {
    const classes = ["relay-btn", variantClass[variant], isLoading && "relay-btn--loading", className]
      .filter(Boolean)
      .join(" ");

    // When as="a", render an anchor to avoid nested interactive elements
    if (rest.as === "a") {
      const { as: _as, ...anchorProps } = rest;
      return (
        <a ref={ref as React.Ref<HTMLAnchorElement>} className={classes} {...anchorProps}>
          {isLoading && <span className="relay-btn__spinner" aria-hidden="true" />}
          {children}
        </a>
      );
    }

    const { as: _as, ...buttonProps } = rest as ButtonAsButtonProps;
    return (
      <button
        ref={ref as React.Ref<HTMLButtonElement>}
        className={classes}
        aria-busy={isLoading || undefined}
        disabled={buttonProps.disabled || isLoading}
        {...buttonProps}
      >
        {isLoading && <span className="relay-btn__spinner" aria-hidden="true" />}
        {children}
      </button>
    );
  },
);
