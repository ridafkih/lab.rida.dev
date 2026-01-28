import { type ReactNode } from "react";
import { cn } from "../utils/cn";
import { Heading } from "./heading";
import { Copy } from "./copy";

export type EmptyStateProps = {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
};

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn("flex flex-col items-center justify-center py-12 px-4 text-center", className)}
    >
      {icon && <span className="mb-4 text-muted-foreground">{icon}</span>}
      <Heading as="h3" size="lg">
        {title}
      </Heading>
      {description && (
        <Copy size="sm" muted className="mt-1 max-w-sm">
          {description}
        </Copy>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
