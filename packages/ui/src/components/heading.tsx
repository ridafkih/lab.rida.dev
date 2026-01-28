import { type ElementType, type HTMLAttributes } from "react";
import { cn } from "../utils/cn";

type HeadingLevel = "h1" | "h2" | "h3" | "h4" | "h5" | "h6";

export type HeadingProps = HTMLAttributes<HTMLHeadingElement> & {
  as?: HeadingLevel;
  size?: "xs" | "sm" | "base" | "lg" | "xl" | "2xl" | "3xl" | "4xl";
};

const sizeStyles = {
  xs: "text-xs",
  sm: "text-sm",
  base: "text-base",
  lg: "text-lg",
  xl: "text-xl",
  "2xl": "text-2xl",
  "3xl": "text-3xl",
  "4xl": "text-4xl",
};

const defaultSizeForLevel: Record<HeadingLevel, keyof typeof sizeStyles> = {
  h1: "4xl",
  h2: "3xl",
  h3: "2xl",
  h4: "xl",
  h5: "lg",
  h6: "base",
};

export function Heading({ as, size, className, children, ...props }: HeadingProps) {
  const Component: ElementType = as || "h2";
  const level = (as || "h2") satisfies HeadingLevel;
  const resolvedSize = size || defaultSizeForLevel[level];

  return (
    <Component
      className={cn(
        "font-sans font-semibold text-foreground tracking-tight",
        sizeStyles[resolvedSize],
        className,
      )}
      {...props}
    >
      {children}
    </Component>
  );
}
