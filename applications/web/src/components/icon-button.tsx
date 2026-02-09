import type { ComponentProps, ElementType, Ref } from "react";
import { tv, type VariantProps } from "tailwind-variants";

const iconButton = tv({
  base: "-m-1.5 shrink-0 cursor-pointer p-1.5",
  variants: {
    variant: {
      ghost: "text-text-muted hover:text-text",
    },
  },
  defaultVariants: {
    variant: "ghost",
  },
});

type IconButtonProps<T extends ElementType = "button"> = ComponentProps<T> &
  VariantProps<typeof iconButton> & {
    as?: T;
    ref?: Ref<HTMLElement>;
  };

export function IconButton<T extends ElementType = "button">({
  as,
  className,
  variant,
  ref,
  ...props
}: IconButtonProps<T>) {
  const Component = as ?? "button";
  return (
    <Component
      className={iconButton({ variant, className })}
      ref={ref}
      {...props}
    />
  );
}
