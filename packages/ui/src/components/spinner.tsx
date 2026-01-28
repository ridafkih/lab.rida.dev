import { cn } from "../utils/cn";

type SpinnerSize = "xxs" | "xs" | "sm" | "md" | "lg";

export type SpinnerProps = {
  size?: SpinnerSize;
  className?: string;
};

const sizeStyles: Record<SpinnerSize, string> = {
  xxs: "h-2 w-2 border",
  xs: "h-3 w-3 border",
  sm: "h-4 w-4 border-2",
  md: "h-6 w-6 border-2",
  lg: "h-8 w-8 border-3",
};

export function Spinner({ size = "md", className }: SpinnerProps) {
  return (
    <span
      className={cn(
        "inline-block animate-spin border-current border-t-transparent rounded-full",
        sizeStyles[size],
        className
      )}
      role="status"
      aria-label="Loading"
    />
  );
}
