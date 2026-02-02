"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { createOpencodeClient, type Message, type Part } from "@opencode-ai/sdk/v2/client";
import { api } from "./api";
import { useOpenCodeSession, type Event } from "./opencode-session";

interface LoadedMessage {
  info: Message;
  parts: Part[];
}

export interface MessageState {
  id: string;
  role: "user" | "assistant";
  parts: Part[];
}

interface SendMessageOptions {
  content: string;
  modelId?: string;
}

export type SessionStatus =
  | { type: "idle" }
  | { type: "busy" }
  | { type: "retry"; attempt: number; message: string; next: number }
  | { type: "error"; message?: string };

interface UseAgentResult {
  isLoading: boolean;
  messages: MessageState[];
  error: Error | null;
  sendMessage: (options: SendMessageOptions) => Promise<void>;
  abortSession: () => Promise<void>;
  isSending: boolean;
  sessionStatus: SessionStatus;
}

export interface CachedSessionData {
  opencodeSessionId: string;
  messages: MessageState[];
  timestamp: number;
}

const CACHE_TTL = 5 * 60 * 1000;

const sessionCache = new Map<string, CachedSessionData>();
const pendingPrefetches = new Map<string, Promise<CachedSessionData | null>>();

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

function parseLoadedMessages(data: LoadedMessage[]): MessageState[] {
  return data.map((message) => ({
    id: message.info.id,
    role: message.info.role,
    parts: message.parts,
  }));
}

function getSessionIdFromEvent(event: Event): string | undefined {
  if (!("properties" in event)) return undefined;

  const properties = event.properties;

  if ("sessionID" in properties && typeof properties.sessionID === "string") {
    return properties.sessionID;
  }

  if ("info" in properties && typeof properties.info === "object" && properties.info !== null) {
    const info = properties.info;
    if ("sessionID" in info && typeof info.sessionID === "string") {
      return info.sessionID;
    }
  }

  if ("part" in properties && typeof properties.part === "object" && properties.part !== null) {
    const part = properties.part;
    if ("sessionID" in part && typeof part.sessionID === "string") {
      return part.sessionID;
    }
  }

  return undefined;
}

function sortPartsById(parts: Part[]): Part[] {
  return parts.toSorted((partA, partB) => partA.id.localeCompare(partB.id));
}

function upsertPart(parts: Part[], part: Part): Part[] {
  const existingIndex = parts.findIndex((existing) => existing.id === part.id);
  if (existingIndex === -1) {
    return [...parts, part];
  }
  return parts.map((existing, index) => (index === existingIndex ? part : existing));
}

async function fetchSessionMessages(labSessionId: string): Promise<CachedSessionData | null> {
  const labSession = await api.sessions.get(labSessionId);
  if (!labSession.opencodeSessionId) return null;

  const client = createSessionClient(labSessionId);
  const messagesResponse = await client.session.messages({
    sessionID: labSession.opencodeSessionId,
  });

  if (messagesResponse.error) {
    console.error("[fetchSessionMessages] Error:", messagesResponse.error);
    return null;
  }

  if (!messagesResponse.data) return null;

  return {
    opencodeSessionId: labSession.opencodeSessionId,
    messages: parseLoadedMessages(messagesResponse.data),
    timestamp: Date.now(),
  };
}

export async function prefetchSessionMessages(labSessionId: string): Promise<void> {
  const cached = sessionCache.get(labSessionId);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) return;
  if (pendingPrefetches.has(labSessionId)) return;

  const prefetchPromise = (async (): Promise<CachedSessionData | null> => {
    try {
      const data = await fetchSessionMessages(labSessionId);
      if (data) sessionCache.set(labSessionId, { ...data, timestamp: Date.now() });
      return data;
    } catch {
      return null;
    } finally {
      pendingPrefetches.delete(labSessionId);
    }
  })();

  pendingPrefetches.set(labSessionId, prefetchPromise);
}

export function invalidateSessionCache(labSessionId: string): void {
  sessionCache.delete(labSessionId);
  pendingPrefetches.delete(labSessionId);
}

export function useAgent(labSessionId: string): UseAgentResult {
  const { subscribe } = useOpenCodeSession();
  const [opencodeSessionId, setOpencodeSessionId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [messages, setMessages] = useState<MessageState[]>([]);
  const [error, setError] = useState<Error | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [sessionStatus, setSessionStatus] = useState<SessionStatus>({ type: "idle" });
  const currentOpencodeSessionRef = useRef<string | null>(null);
  const sendingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const opencodeClient = useMemo(() => {
    if (!labSessionId) return null;
    return createSessionClient(labSessionId);
  }, [labSessionId]);

  useEffect(() => {
    const cached = sessionCache.get(labSessionId);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      setMessages(cached.messages);
      setOpencodeSessionId(cached.opencodeSessionId);
      currentOpencodeSessionRef.current = cached.opencodeSessionId;
      setIsLoading(false);
      return;
    }

    setOpencodeSessionId(null);
    currentOpencodeSessionRef.current = null;

    if (!labSessionId || !opencodeClient) {
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    const applySessionData = (sessionId: string, sessionMessages: MessageState[]) => {
      setMessages(sessionMessages);
      setOpencodeSessionId(sessionId);
      currentOpencodeSessionRef.current = sessionId;
      sessionCache.set(labSessionId, {
        opencodeSessionId: sessionId,
        messages: sessionMessages,
        timestamp: Date.now(),
      });
      setIsLoading(false);
    };

    const getOrCreateOpencodeSession = async (): Promise<string> => {
      const labSession = await api.sessions.get(labSessionId);
      if (labSession.opencodeSessionId) return labSession.opencodeSessionId;

      const response = await opencodeClient.session.create({});
      if (response.error || !response.data) {
        throw new Error("Failed to create OpenCode session");
      }

      return response.data.id;
    };

    const initialize = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const pending = pendingPrefetches.get(labSessionId);
        if (pending) {
          const prefetched = await pending;
          if (cancelled) return;
          if (prefetched) {
            applySessionData(prefetched.opencodeSessionId, prefetched.messages);
            return;
          }
        }

        const sessionId = await getOrCreateOpencodeSession();
        if (cancelled) return;

        console.log("[useAgent] Fetching messages for session:", sessionId);
        const messagesResponse = await opencodeClient.session.messages({
          sessionID: sessionId,
        });
        console.log("[useAgent] Messages response:", {
          hasData: !!messagesResponse.data,
          dataLength: messagesResponse.data?.length,
          hasError: !!messagesResponse.error,
          error: messagesResponse.error,
        });
        if (cancelled) return;

        if (messagesResponse.error) {
          throw new Error(`Failed to fetch messages: ${JSON.stringify(messagesResponse.error)}`);
        }

        const loadedMessages = parseLoadedMessages(messagesResponse.data ?? []);
        applySessionData(sessionId, loadedMessages);
      } catch (error) {
        if (cancelled) return;
        setError(error instanceof Error ? error : new Error("Failed to initialize"));
        setIsLoading(false);
      }
    };

    initialize();

    return () => {
      cancelled = true;
    };
  }, [labSessionId, opencodeClient]);

  useEffect(() => {
    if (!opencodeSessionId) return;

    const handleMessageUpdated = (info: Message) => {
      setMessages((previous) => {
        const existing = previous.find((message) => message.id === info.id);
        if (existing) return previous;
        return [...previous, { id: info.id, role: info.role, parts: [] }];
      });
    };

    const handleMessagePartUpdated = (part: Part) => {
      setMessages((previous) =>
        previous.map((message) => {
          if (message.id !== part.messageID) return message;
          return { ...message, parts: sortPartsById(upsertPart(message.parts, part)) };
        }),
      );
    };

    const processEvent = (event: Event) => {
      // Only log non-heartbeat events to reduce noise
      if (event.type !== "server.heartbeat") {
        console.log("[useAgent] Event received:", {
          type: event.type,
          properties: event.properties,
        });
      }

      // Only filter session-specific events
      const sessionSpecificEvents = [
        "message.updated",
        "message.part.updated",
        "session.idle",
        "session.error",
        "session.status",
      ];

      if (sessionSpecificEvents.includes(event.type)) {
        const eventSessionId = getSessionIdFromEvent(event);
        console.log("[useAgent] Session ID check for", event.type, ":", {
          eventSessionId,
          currentSessionId: currentOpencodeSessionRef.current,
          match: eventSessionId === currentOpencodeSessionRef.current,
        });

        if (eventSessionId !== currentOpencodeSessionRef.current) {
          console.log("[useAgent] Event filtered out due to session ID mismatch");
          return;
        }
      }

      if (event.type === "message.updated") {
        console.log("[useAgent] Processing message.updated");
        handleMessageUpdated(event.properties.info);
      }

      if (event.type === "message.part.updated") {
        console.log("[useAgent] Processing message.part.updated", event.properties.part);
        handleMessagePartUpdated(event.properties.part);
      }

      if (event.type === "session.status") {
        const status = event.properties.status as SessionStatus;
        setSessionStatus(status);
      }

      if (event.type === "session.idle") {
        if (sendingTimeoutRef.current) {
          clearTimeout(sendingTimeoutRef.current);
          sendingTimeoutRef.current = null;
        }
        setIsSending(false);
        setSessionStatus({ type: "idle" });
      }

      if (event.type === "session.error") {
        if (sendingTimeoutRef.current) {
          clearTimeout(sendingTimeoutRef.current);
          sendingTimeoutRef.current = null;
        }
        setIsSending(false);
        setSessionStatus({ type: "error" });
      }
    };

    return subscribe(processEvent);
  }, [subscribe, opencodeSessionId]);

  const sendMessage = useCallback(
    async ({ content, modelId }: SendMessageOptions) => {
      if (!opencodeSessionId || !opencodeClient) {
        throw new Error("Session not initialized");
      }

      setError(null);
      setIsSending(true);

      if (sendingTimeoutRef.current) {
        clearTimeout(sendingTimeoutRef.current);
      }

      sendingTimeoutRef.current = setTimeout(
        () => {
          setIsSending(false);
          sendingTimeoutRef.current = null;
        },
        5 * 60 * 1000,
      );

      try {
        const [providerID, modelID] = modelId?.split("/") ?? [];
        const response = await opencodeClient.session.promptAsync({
          sessionID: opencodeSessionId,
          model: {
            providerID,
            modelID,
          },
          parts: [{ type: "text", text: content }],
        });

        if (response.error) {
          throw new Error(`Failed to send message: ${JSON.stringify(response.error)}`);
        }
      } catch (error) {
        const errorInstance = error instanceof Error ? error : new Error("Failed to send message");
        setError(errorInstance);
        setIsSending(false);
        throw errorInstance;
      } finally {
        if (sendingTimeoutRef.current) {
          clearTimeout(sendingTimeoutRef.current);
          sendingTimeoutRef.current = null;
        }
      }
    },
    [opencodeSessionId, opencodeClient],
  );

  const abortSession = useCallback(async () => {
    if (!currentOpencodeSessionRef.current || !opencodeClient) return;

    try {
      await opencodeClient.session.abort({
        sessionID: currentOpencodeSessionRef.current,
      });
    } catch (error) {
      console.error("[useAgent] Abort failed:", error);
    }
  }, [opencodeClient]);

  return {
    isLoading,
    messages,
    error,
    sendMessage,
    abortSession,
    isSending,
    sessionStatus,
  };
}
