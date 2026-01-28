import { type ElementType, type HTMLAttributes } from "react";
import { cn } from "../utils/cn";

type CopyElement = "p" | "span" | "div" | "label";

export type CopyProps = HTMLAttributes<HTMLElement> & {
  as?: CopyElement;
  size?: "xs" | "sm" | "base" | "lg";
  muted?: boolean;
};

const sizeStyles = {
  xs: "text-xs",
  sm: "text-sm",
  base: "text-base",
  lg: "text-lg",
};

export function Copy({
  as,
  size = "base",
  muted = false,
  className,
  children,
  ...props
}: CopyProps) {
  const Component: ElementType = as || "p";

  return (
    <Component
      className={cn(
        "font-sans",
        sizeStyles[size],
        muted ? "text-muted-foreground" : "text-foreground",
        className,
      )}
      {...props}
    >
      {children}
    </Component>
  );
}
