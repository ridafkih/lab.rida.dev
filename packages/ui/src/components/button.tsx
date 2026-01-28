import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "../utils/cn";
import { Slot } from "../utils/slot";
import { Spinner } from "./spinner";

type ButtonVariant = "primary" | "primary-accent" | "secondary";

const variantStyles: Record<ButtonVariant, string> = {
  primary: "bg-primary text-primary-foreground hover:bg-primary/90",
  "primary-accent": "bg-accent text-accent-foreground hover:bg-accent/90",
  secondary: "bg-muted text-muted-foreground hover:bg-muted/70",
};

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  loading?: boolean;
  asChild?: boolean;
  icon?: ReactNode;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { className, variant = "primary", loading = false, disabled, asChild = false, icon, children, ...props },
    ref,
  ) => {
    const Comp = asChild ? Slot : "button";
    const isDisabled = disabled || loading;

    return (
      <Comp
        ref={ref}
        className={cn(
          "flex items-center justify-center gap-1 px-2 py-1 text-xs",
          variantStyles[variant],
          "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
          "disabled:pointer-events-none disabled:opacity-50",
          className,
        )}
        disabled={isDisabled}
        {...props}
      >
        {loading && <Spinner size="sm" />}
        {!loading && icon}
        {children}
      </Comp>
    );
  },
);

Button.displayName = "Button";
