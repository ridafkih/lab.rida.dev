"use client";

import { useState, useCallback, useEffect } from "react";
import { useSessionLifecycle } from "../session/use-session-lifecycle";

export interface FileNode {
  name: string;
  path: string;
  absolute: string;
  type: "file" | "directory";
  ignored: boolean;
}

interface UseFileBrowserOptions {
  labSessionId: string;
}

interface UseFileBrowserResult {
  rootNodes: FileNode[];
  expandedPaths: Set<string>;
  loadedContents: Map<string, FileNode[]>;
  selectedPath: string | null;
  previewContent: { type: string; content: string } | null;

  rootLoading: boolean;
  loadingPaths: Set<string>;
  previewLoading: boolean;

  loadRoot: () => Promise<void>;
  toggleDirectory: (path: string) => Promise<void>;
  selectFile: (path: string) => Promise<void>;
  clearSelection: () => void;
}

export function useFileBrowser({ labSessionId }: UseFileBrowserOptions): UseFileBrowserResult {
  const { opencodeClient, isInitializing } = useSessionLifecycle(labSessionId);

  const [rootNodes, setRootNodes] = useState<FileNode[]>([]);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const [loadedContents, setLoadedContents] = useState<Map<string, FileNode[]>>(new Map());
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [previewContent, setPreviewContent] = useState<{ type: string; content: string } | null>(
    null,
  );

  const [rootLoading, setRootLoading] = useState(false);
  const [loadingPaths, setLoadingPaths] = useState<Set<string>>(new Set());
  const [previewLoading, setPreviewLoading] = useState(false);

  const loadRoot = useCallback(async () => {
    if (isInitializing) return;

    setRootLoading(true);
    try {
      const response = await opencodeClient.file.list({ query: { path: "." } });
      if (response.data) {
        const sortedNodes = sortFileNodes(response.data as FileNode[]);
        setRootNodes(sortedNodes);
      }
    } catch (error) {
      console.error("Failed to load root directory:", error);
    } finally {
      setRootLoading(false);
    }
  }, [opencodeClient, isInitializing]);

  const toggleDirectory = useCallback(
    async (path: string) => {
      if (expandedPaths.has(path)) {
        setExpandedPaths((prev) => {
          const next = new Set(prev);
          next.delete(path);
          return next;
        });
        return;
      }

      if (loadedContents.has(path)) {
        setExpandedPaths((prev) => new Set([...prev, path]));
        return;
      }

      setLoadingPaths((prev) => new Set([...prev, path]));
      try {
        const response = await opencodeClient.file.list({ query: { path } });
        if (response.data) {
          const sortedNodes = sortFileNodes(response.data as FileNode[]);
          setLoadedContents((prev) => new Map(prev).set(path, sortedNodes));
          setExpandedPaths((prev) => new Set([...prev, path]));
        }
      } catch (error) {
        console.error(`Failed to load directory ${path}:`, error);
      } finally {
        setLoadingPaths((prev) => {
          const next = new Set(prev);
          next.delete(path);
          return next;
        });
      }
    },
    [opencodeClient, expandedPaths, loadedContents],
  );

  const selectFile = useCallback(
    async (path: string) => {
      setSelectedPath(path);
      setPreviewLoading(true);
      setPreviewContent(null);

      try {
        const response = await opencodeClient.file.read({ query: { path } });
        if (response.data) {
          setPreviewContent(response.data as { type: string; content: string });
        }
      } catch (error) {
        console.error(`Failed to read file ${path}:`, error);
        setPreviewContent({ type: "error", content: "Failed to load file content" });
      } finally {
        setPreviewLoading(false);
      }
    },
    [opencodeClient],
  );

  const clearSelection = useCallback(() => {
    setSelectedPath(null);
    setPreviewContent(null);
  }, []);

  useEffect(() => {
    if (!isInitializing) {
      loadRoot();
    }
  }, [isInitializing, loadRoot]);

  return {
    rootNodes,
    expandedPaths,
    loadedContents,
    selectedPath,
    previewContent,
    rootLoading,
    loadingPaths,
    previewLoading,
    loadRoot,
    toggleDirectory,
    selectFile,
    clearSelection,
  };
}

function sortFileNodes(nodes: FileNode[]): FileNode[] {
  return [...nodes].sort((a, b) => {
    if (a.type === "directory" && b.type === "file") return -1;
    if (a.type === "file" && b.type === "directory") return 1;
    return a.name.localeCompare(b.name);
  });
}
