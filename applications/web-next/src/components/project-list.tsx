import type { ReactNode } from "react";

type ProjectListProps = {
  children: ReactNode;
};

export function ProjectList({ children }: ProjectListProps) {
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="flex flex-col gap-px bg-border py-px">{children}</div>
    </div>
  );
}
