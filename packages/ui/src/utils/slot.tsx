import {
  Children,
  cloneElement,
  isValidElement,
  type ReactNode,
  type HTMLAttributes,
  type ReactElement,
} from "react";

type SlotProps = HTMLAttributes<HTMLElement> & {
  children?: ReactNode;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isFunction(value: unknown): value is (...args: unknown[]) => unknown {
  return typeof value === "function";
}

function mergeProps(slotProps: Record<string, unknown>, childProps: Record<string, unknown>) {
  const merged: Record<string, unknown> = { ...slotProps };

  for (const key in childProps) {
    const slotValue = slotProps[key];
    const childValue = childProps[key];

    if (key === "className") {
      merged[key] = [slotValue, childValue].filter(Boolean).join(" ");
    } else if (key === "style" && isObject(slotValue) && isObject(childValue)) {
      merged[key] = { ...slotValue, ...childValue };
    } else if (key.startsWith("on") && isFunction(slotValue)) {
      merged[key] = (...args: unknown[]) => {
        if (isFunction(childValue)) childValue(...args);
        slotValue(...args);
      };
    } else {
      merged[key] = childValue !== undefined ? childValue : slotValue;
    }
  }

  return merged;
}

function isReactElement(value: unknown): value is ReactElement<Record<string, unknown>> {
  return isValidElement(value);
}

export function Slot({ children, ...props }: SlotProps) {
  const child = Children.only(children);

  if (!isReactElement(child)) {
    return null;
  }

  return cloneElement(child, mergeProps(props, child.props));
}
