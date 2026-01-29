"use client";

import { FileTreeNode } from "./file-tree-node";
import type { FileNode } from "@/lib/opencode/hooks/use-file-browser";

interface FileTreeProps {
  nodes: FileNode[];
  expandedPaths: Set<string>;
  loadedContents: Map<string, FileNode[]>;
  loadingPaths: Set<string>;
  selectedPath: string | null;
  onToggleDirectory: (path: string) => void;
  onSelectFile: (path: string) => void;
  depth?: number;
}

export function FileTree({
  nodes,
  expandedPaths,
  loadedContents,
  loadingPaths,
  selectedPath,
  onToggleDirectory,
  onSelectFile,
  depth = 0,
}: FileTreeProps) {
  if (nodes.length === 0 && depth === 0) {
    return (
      <div className="flex items-center justify-center p-4 text-muted-foreground text-xs">
        No files found
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {nodes.map((node) => {
        const isExpanded = expandedPaths.has(node.path);
        const isLoading = loadingPaths.has(node.path);
        const isSelected = selectedPath === node.path;
        const children = loadedContents.get(node.path) ?? [];

        return (
          <div key={node.path}>
            <FileTreeNode
              node={node}
              depth={depth}
              isExpanded={isExpanded}
              isLoading={isLoading}
              isSelected={isSelected}
              onToggle={() => onToggleDirectory(node.path)}
              onSelect={() => onSelectFile(node.path)}
            />
            {node.type === "directory" && isExpanded && children.length > 0 && (
              <FileTree
                nodes={children}
                expandedPaths={expandedPaths}
                loadedContents={loadedContents}
                loadingPaths={loadingPaths}
                selectedPath={selectedPath}
                onToggleDirectory={onToggleDirectory}
                onSelectFile={onSelectFile}
                depth={depth + 1}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
