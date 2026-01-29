"use client";

import { cn } from "@lab/ui/utils/cn";
import { Copy } from "@lab/ui/components/copy";
import { ChevronRight, File, Folder, Loader2 } from "lucide-react";
import type { FileNode } from "@/lib/opencode/hooks/use-file-browser";

interface FileTreeNodeProps {
  node: FileNode;
  depth: number;
  isExpanded: boolean;
  isLoading: boolean;
  isSelected: boolean;
  onToggle: () => void;
  onSelect: () => void;
}

export function FileTreeNode({
  node,
  depth,
  isExpanded,
  isLoading,
  isSelected,
  onToggle,
  onSelect,
}: FileTreeNodeProps) {
  const isDirectory = node.type === "directory";

  const handleClick = () => {
    if (isDirectory) {
      onToggle();
    } else {
      onSelect();
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className={cn(
        "flex items-center gap-1 w-full px-2 py-0.5 text-left text-muted-foreground hover:bg-muted/50",
        isSelected && "bg-muted",
      )}
      style={{ paddingLeft: `${depth * 12 + 8}px` }}
    >
      {isDirectory && (
        <span className="grid size-3 place-items-center">
          {isLoading ? (
            <Loader2 className="size-3 animate-spin" />
          ) : (
            <ChevronRight
              className={cn("size-3 transition-transform", isExpanded && "rotate-90")}
            />
          )}
        </span>
      )}
      {!isDirectory && <span className="size-3" />}
      {isDirectory ? (
        <Folder className="size-3 text-muted-foreground" />
      ) : (
        <File className="size-3 text-muted-foreground" />
      )}
      <Copy as="span" size="xs" className="flex-1 truncate">
        {node.name}
      </Copy>
    </button>
  );
}
