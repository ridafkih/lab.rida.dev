import type { ReactNode } from "react";
import { cn } from "@lab/ui/utils/cn";
import { Copy } from "@lab/ui/components/copy";
import { File, FilePlus, FileX } from "lucide-react";

export type FileChangeType = "modified" | "created" | "deleted";

const changeTypeIcons = {
  modified: File,
  created: FilePlus,
  deleted: FileX,
};

const changeTypeColors = {
  modified: "text-warning",
  created: "text-success",
  deleted: "text-destructive",
};

interface DismissibleFileHeaderProps {
  children: ReactNode;
}

interface DismissibleFileHeaderDismissProps {
  onDismiss: () => void;
}

interface DismissibleFileHeaderIconProps {
  changeType: FileChangeType;
}

interface DismissibleFileHeaderLabelProps {
  children: ReactNode;
}

export function DismissibleFileHeader({ children }: DismissibleFileHeaderProps) {
  return (
    <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-border sticky top-0 bg-background z-10">
      {children}
    </div>
  );
}

export function DismissibleFileHeaderDismiss({ onDismiss }: DismissibleFileHeaderDismissProps) {
  return (
    <button
      type="button"
      onClick={onDismiss}
      className="px-1.5 py-0.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted"
    >
      Dismiss
    </button>
  );
}

export function DismissibleFileHeaderIcon({ changeType }: DismissibleFileHeaderIconProps) {
  const Icon = changeTypeIcons[changeType];
  return <Icon className={cn("size-3 shrink-0", changeTypeColors[changeType])} />;
}

export function DismissibleFileHeaderLabel({ children }: DismissibleFileHeaderLabelProps) {
  return (
    <Copy size="xs" muted className="flex-1 truncate">
      {children}
    </Copy>
  );
}
