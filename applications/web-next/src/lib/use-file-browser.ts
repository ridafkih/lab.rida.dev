"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  createOpencodeClient,
  type FileContent,
  type File as SdkFile,
} from "@opencode-ai/sdk/client";
import { useOpenCodeSession } from "./opencode-session";
import type { BrowserState, BrowserActions, FileNode, FileStatus } from "@/components/review";

function getApiUrl(): string {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  if (!apiUrl) throw new Error("NEXT_PUBLIC_API_URL must be set");
  return apiUrl;
}

function createSessionClient(labSessionId: string) {
  return createOpencodeClient({
    baseUrl: `${getApiUrl()}/opencode`,
    headers: { "X-Lab-Session-Id": labSessionId },
  });
}

type Patch = NonNullable<FileContent["patch"]>;

function toFileStatus(status: SdkFile["status"]): FileStatus {
  return status;
}

export function useFileBrowser(sessionId: string | null): {
  state: BrowserState;
  actions: BrowserActions;
} {
  const { subscribe } = useOpenCodeSession();

  const [rootNodes, setRootNodes] = useState<FileNode[]>([]);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const [loadedContents, setLoadedContents] = useState<Map<string, FileNode[]>>(new Map());
  const [loadingPaths, setLoadingPaths] = useState<Set<string>>(new Set());
  const [rootLoading, setRootLoading] = useState(false);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [previewContent, setPreviewContent] = useState<string | null>(null);
  const [previewPatch, setPreviewPatch] = useState<Patch | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [fileStatuses, setFileStatuses] = useState<Map<string, FileStatus>>(new Map());

  const client = useMemo(() => {
    if (!sessionId) return null;
    return createSessionClient(sessionId);
  }, [sessionId]);

  useEffect(() => {
    setRootNodes([]);
    setExpandedPaths(new Set());
    setLoadedContents(new Map());
    setLoadingPaths(new Set());
    setSelectedPath(null);
    setPreviewContent(null);
    setPreviewPatch(null);
    setFileStatuses(new Map());
  }, [sessionId]);

  const fetchFileStatuses = useCallback(async () => {
    if (!client) return;

    try {
      const response = await client.file.status({
        query: {},
      });

      if (response.data) {
        const statuses = new Map<string, FileStatus>();
        for (const file of response.data) {
          statuses.set(file.path, toFileStatus(file.status));
        }
        setFileStatuses(statuses);
      }
    } catch (error) {
      console.error("Failed to fetch file statuses:", error);
    }
  }, [client]);

  useEffect(() => {
    if (!client) return;

    let cancelled = false;

    const fetchRoot = async () => {
      setRootLoading(true);
      try {
        const response = await client.file.list({
          query: { path: "." },
        });

        if (cancelled) return;

        if (response.data) {
          const nodes: FileNode[] = response.data.map((node) => ({
            name: node.name,
            path: node.path,
            type: node.type,
          }));
          setRootNodes(nodes);
        }
      } catch (error) {
        console.error("Failed to fetch root files:", error);
      } finally {
        if (!cancelled) {
          setRootLoading(false);
        }
      }
    };

    fetchRoot();
    fetchFileStatuses();

    return () => {
      cancelled = true;
    };
  }, [client, fetchFileStatuses]);

  useEffect(() => {
    const handleEvent = (event: { type: string }) => {
      if (event.type === "file.watcher.updated" || event.type === "file.edited") {
        fetchFileStatuses();
      }
    };

    return subscribe(handleEvent);
  }, [subscribe, fetchFileStatuses]);

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

      if (!loadedContents.has(path) && client) {
        setLoadingPaths((prev) => new Set([...prev, path]));

        try {
          const response = await client.file.list({
            query: { path },
          });

          if (response.data) {
            const nodes: FileNode[] = response.data.map((node) => ({
              name: node.name,
              path: node.path,
              type: node.type,
            }));
            setLoadedContents((prev) => new Map(prev).set(path, nodes));
          }
        } catch (error) {
          console.error("Failed to fetch directory contents:", error);
        } finally {
          setLoadingPaths((prev) => {
            const next = new Set(prev);
            next.delete(path);
            return next;
          });
        }
      }

      setExpandedPaths((prev) => new Set([...prev, path]));
    },
    [client, expandedPaths, loadedContents],
  );

  const selectFile = useCallback(
    async (path: string) => {
      if (!client) return;

      setSelectedPath(path);
      setPreviewLoading(true);
      setPreviewContent(null);
      setPreviewPatch(null);

      try {
        const response = await client.file.read({
          query: { path },
        });

        if (response.data && response.data.type === "text") {
          setPreviewContent(response.data.content);
          setPreviewPatch(response.data.patch ?? null);
        } else {
          setPreviewContent("// Unable to read file");
        }
      } catch (error) {
        console.error("Failed to read file:", error);
        setPreviewContent("// Failed to load file");
      } finally {
        setPreviewLoading(false);
      }
    },
    [client],
  );

  const clearFileSelection = useCallback(() => {
    setSelectedPath(null);
    setPreviewContent(null);
    setPreviewPatch(null);
  }, []);

  const state: BrowserState = {
    rootNodes,
    expandedPaths,
    loadedContents,
    loadingPaths,
    rootLoading,
    selectedPath,
    previewContent,
    previewPatch,
    previewLoading,
    fileStatuses,
  };

  const actions: BrowserActions = {
    toggleDirectory,
    selectFile,
    clearFileSelection,
  };

  return { state, actions };
}
