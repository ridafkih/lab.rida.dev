"use client";

import { Copy } from "@lab/ui/components/copy";
import { Loader2 } from "lucide-react";
import { FileTree } from "./file-tree";
import type { FileNode } from "@/lib/opencode/hooks/use-file-browser";

interface FileBrowserPanelProps {
  rootNodes: FileNode[];
  expandedPaths: Set<string>;
  loadedContents: Map<string, FileNode[]>;
  loadingPaths: Set<string>;
  selectedPath: string | null;
  rootLoading: boolean;
  onToggleDirectory: (path: string) => void;
  onSelectFile: (path: string) => void;
}

export function FileBrowserPanel({
  rootNodes,
  expandedPaths,
  loadedContents,
  loadingPaths,
  selectedPath,
  rootLoading,
  onToggleDirectory,
  onSelectFile,
}: FileBrowserPanelProps) {
  return (
    <div className="flex flex-col h-full border-l border-border">
      <div className="flex items-center h-8 px-2 border-b border-border shrink-0">
        <Copy as="span" size="xs" muted>
          Files
        </Copy>
      </div>
      <div className="flex-1 overflow-auto">
        {rootLoading ? (
          <div className="flex items-center justify-center p-4">
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <FileTree
            nodes={rootNodes}
            expandedPaths={expandedPaths}
            loadedContents={loadedContents}
            loadingPaths={loadingPaths}
            selectedPath={selectedPath}
            onToggleDirectory={onToggleDirectory}
            onSelectFile={onSelectFile}
          />
        )}
      </div>
    </div>
  );
}
