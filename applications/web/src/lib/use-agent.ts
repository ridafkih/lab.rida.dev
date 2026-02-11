"use client";

import { useEffect, useRef, useState } from "react";
import useSWR, { useSWRConfig } from "swr";
import { api } from "./api";
import {
  getAgentApiUrl,
  parseSSEChunk,
  useSandboxAgentSession,
} from "./sandbox-agent-session";
import type { ContentPart, SandboxAgentEvent } from "./sandbox-agent-types";
import type { Attachment } from "./use-attachments";

export interface MessageState {
  id: string;
  role: "user" | "assistant";
  parts: ContentPart[];
}

interface SendMessageOptions {
  content: string;
  modelId?: string;
  attachments?: Attachment[];
}

export type SessionStatus =
  | { type: "idle" }
  | { type: "busy" }
  | { type: "retry"; attempt: number; message: string; next: number }
  | {
      type: "error";
      message?: string;
      isRetryable?: boolean;
      statusCode?: number;
    };

interface UseAgentResult {
  isLoading: boolean;
  messages: MessageState[];
  error: Error | null;
  sendMessage: (options: SendMessageOptions) => Promise<void>;
  abortSession: () => Promise<void>;
  isSending: boolean;
  sessionStatus: SessionStatus;
  questionRequests: Map<string, string>;
}

interface SessionData {
  sandboxSessionId: string;
  messages: MessageState[];
  lastSequence: number;
}

function getString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function extractEventItem(
  eventData: Record<string, unknown>
): Record<string, unknown> {
  if (typeof eventData.item === "object" && eventData.item !== null) {
    return eventData.item as Record<string, unknown>;
  }
  return eventData;
}

function extractItemId(
  item: Record<string, unknown>,
  fallback: string
): string {
  return typeof item.item_id === "string" ? item.item_id : fallback;
}

function extractContentParts(
  item: Record<string, unknown>
): Record<string, unknown>[] {
  return Array.isArray(item.content) ? item.content : [];
}

function tryParseJson(value: string): Record<string, unknown> {
  try {
    return JSON.parse(value);
  } catch (error) {
    console.warn("Failed to parse tool arguments:", error);
    return {};
  }
}

const TOOL_CALL_STATUSES = ["in_progress", "completed", "error"] as const;
type ToolCallStatus = (typeof TOOL_CALL_STATUSES)[number];

function isToolCallStatus(value: unknown): value is ToolCallStatus {
  return (
    typeof value === "string" &&
    TOOL_CALL_STATUSES.includes(value as ToolCallStatus)
  );
}

function normalizeToolCall(raw: Record<string, unknown>): ContentPart {
  let input: Record<string, unknown> = {};
  if (typeof raw.arguments === "string") {
    input = tryParseJson(raw.arguments);
  } else if (typeof raw.input === "object" && raw.input !== null) {
    input = raw.input as Record<string, unknown>;
  }
  return {
    type: "tool_call" as const,
    id: getString(raw.call_id ?? raw.id),
    name: getString(raw.name),
    input,
    status: isToolCallStatus(raw.status) ? raw.status : "in_progress",
  };
}

function normalizeToolResult(raw: Record<string, unknown>): ContentPart {
  return {
    type: "tool_result" as const,
    tool_call_id: getString(raw.call_id ?? raw.tool_call_id),
    output: typeof raw.output === "string" ? raw.output : undefined,
    error: typeof raw.error === "string" ? raw.error : undefined,
  };
}

function normalizeTextPart(raw: Record<string, unknown>): ContentPart {
  return { type: "text" as const, text: getString(raw.text) };
}

function normalizeSinglePart(raw: Record<string, unknown>): ContentPart {
  const type = getString(raw.type);
  if (type === "tool_call") {
    return normalizeToolCall(raw);
  }
  if (type === "tool_result") {
    return normalizeToolResult(raw);
  }
  if (type === "text") {
    return normalizeTextPart(raw);
  }
  return { type: "text" as const, text: "" };
}

/**
 * Normalize raw content parts from Sandbox Agent events into the ContentPart
 * types expected by the frontend. Sandbox Agent uses `call_id` and `arguments`
 * (JSON string) while our types use `id` and `input` (parsed object).
 */
function normalizeContentParts(
  rawParts: Record<string, unknown>[]
): ContentPart[] {
  return rawParts.map(normalizeSinglePart);
}

/**
 * Mark tool_call parts as "completed" or "error" when a matching tool_result
 * exists in the same message.
 */
function resolveToolCallStatuses(parts: ContentPart[]): ContentPart[] {
  const resultsByCallId = new Map<
    string,
    { output?: string; error?: string }
  >();
  for (const part of parts) {
    if (part.type === "tool_result" && "tool_call_id" in part) {
      resultsByCallId.set(part.tool_call_id, {
        output: part.output,
        error: part.error,
      });
    }
  }

  if (resultsByCallId.size === 0) {
    return parts;
  }

  return parts.map((part) => {
    if (part.type === "tool_call" && part.status === "in_progress") {
      const result = resultsByCallId.get(part.id);
      if (result) {
        return {
          ...part,
          status: result.error ? ("error" as const) : ("completed" as const),
        };
      }
    }
    return part;
  });
}

/**
 * Determines whether a Sandbox Agent item should be merged into the current
 * assistant message (tool calls, tool results) or create a new message.
 */
function shouldMergeItem(item: Record<string, unknown>): boolean {
  return (
    item.kind === "tool_call" ||
    item.kind === "tool_result" ||
    item.role === "tool"
  );
}

function handleReplayItemStarted(
  event: SandboxAgentEvent,
  messages: MessageState[],
  itemIdToMessageId: Map<string, string>,
  currentAssistantId: { value: string | null }
): void {
  const item = extractEventItem(event.data);
  const role =
    item.role === "user" ? ("user" as const) : ("assistant" as const);
  const itemId = extractItemId(item, `item-${event.sequence}`);
  const content = normalizeContentParts(extractContentParts(item));

  if (role === "user") {
    messages.push({ id: itemId, role, parts: content });
    itemIdToMessageId.set(itemId, itemId);
    return;
  }

  if (shouldMergeItem(item) && currentAssistantId.value) {
    itemIdToMessageId.set(itemId, currentAssistantId.value);
    const assistantMsg = messages.find(
      (m) => m.id === currentAssistantId.value
    );
    if (assistantMsg && content.length > 0) {
      assistantMsg.parts = [...assistantMsg.parts, ...content];
    }
    return;
  }

  messages.push({ id: itemId, role, parts: content });
  itemIdToMessageId.set(itemId, itemId);
  currentAssistantId.value = itemId;
}

function handleReplayItemDelta(
  event: SandboxAgentEvent,
  messages: MessageState[],
  itemIdToMessageId: Map<string, string>
): void {
  const rawItemId = getString(event.data.item_id) || null;
  const deltaText = getString(event.data.delta) || null;

  if (!(rawItemId && deltaText)) {
    return;
  }

  const messageId = itemIdToMessageId.get(rawItemId) ?? rawItemId;
  const message = messages.find((m) => m.id === messageId);
  if (!message) {
    return;
  }

  const lastPart = message.parts.at(-1);
  if (lastPart && lastPart.type === "text") {
    lastPart.text += deltaText;
  } else {
    message.parts.push({ type: "text", text: deltaText });
  }
}

function handleReplayItemCompleted(
  event: SandboxAgentEvent,
  messages: MessageState[],
  itemIdToMessageId: Map<string, string>
): void {
  const item = extractEventItem(event.data);
  const rawItemId = getString(item.item_id) || null;
  const content = normalizeContentParts(extractContentParts(item));

  if (!rawItemId || content.length === 0) {
    return;
  }

  const messageId = itemIdToMessageId.get(rawItemId) ?? rawItemId;
  const message = messages.find((m) => m.id === messageId);
  if (!message) {
    return;
  }

  if (messageId === rawItemId) {
    if (message.parts.length === 0) {
      message.parts = [...content];
    }
  } else {
    message.parts = [...message.parts, ...content];
  }
}

function reconstructMessagesFromEvents(
  events: SandboxAgentEvent[]
): MessageState[] {
  const messages: MessageState[] = [];
  const itemIdToMessageId = new Map<string, string>();
  const currentAssistantId = { value: null as string | null };

  for (const event of events) {
    switch (event.type) {
      case "item.started":
        handleReplayItemStarted(
          event,
          messages,
          itemIdToMessageId,
          currentAssistantId
        );
        break;
      case "item.delta":
        handleReplayItemDelta(event, messages, itemIdToMessageId);
        break;
      case "item.completed":
        handleReplayItemCompleted(event, messages, itemIdToMessageId);
        break;
      default:
        break;
    }
  }

  for (const message of messages) {
    message.parts = resolveToolCallStatuses(message.parts);
  }

  return messages;
}

async function fetchSessionEvents(
  labSessionId: string
): Promise<SandboxAgentEvent[]> {
  const apiUrl = getAgentApiUrl();
  const response = await fetch(`${apiUrl}/sandbox-agent/events?replay=true`, {
    headers: {
      Accept: "application/json",
      "X-Lab-Session-Id": labSessionId,
    },
  });

  if (!response.ok) {
    return [];
  }

  return response.json();
}

function getPreferredModel(): string | null {
  try {
    const stored = localStorage.getItem("preferred-model");
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
}

async function fetchSessionData(
  labSessionId: string
): Promise<SessionData | null> {
  const labSession = await api.sessions.get(labSessionId);

  let sandboxSessionId = labSession.sandboxSessionId;

  if (!sandboxSessionId) {
    const apiUrl = getAgentApiUrl();
    const preferredModel = getPreferredModel();
    const body: Record<string, string> = {};
    if (preferredModel) {
      body.model = preferredModel;
    }
    const response = await fetch(`${apiUrl}/sandbox-agent/sessions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Lab-Session-Id": labSessionId,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error("Failed to create sandbox agent session");
    }

    const data = await response.json();
    sandboxSessionId = data.id;
  }

  if (!sandboxSessionId) {
    return { sandboxSessionId: "", messages: [], lastSequence: 0 };
  }

  const events = await fetchSessionEvents(labSessionId);
  const messages = reconstructMessagesFromEvents(events);
  const lastSequence = events.reduce((max, e) => Math.max(max, e.sequence), 0);

  return { sandboxSessionId, messages, lastSequence };
}

async function readSSEStream(
  response: Response,
  onEvent: (event: SandboxAgentEvent) => void
): Promise<void> {
  const body = response.body;
  if (!body) {
    return;
  }

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const chunks = buffer.split("\n\n");
      buffer = chunks.pop() ?? "";

      for (const chunk of chunks) {
        if (!chunk.trim()) {
          continue;
        }
        const event = parseSSEChunk(chunk);
        if (event) {
          onEvent(event);
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

function getAgentMessagesKey(labSessionId: string): string {
  return `agent-messages-${labSessionId}`;
}

export function useAgent(labSessionId: string): UseAgentResult {
  const { publish } = useSandboxAgentSession();
  const { mutate } = useSWRConfig();
  const [streamedMessages, setStreamedMessages] = useState<
    MessageState[] | null
  >(null);
  const [error, setError] = useState<Error | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [sessionStatus, setSessionStatus] = useState<SessionStatus>({
    type: "idle",
  });
  const [questionRequests, setQuestionRequests] = useState<Map<string, string>>(
    () => new Map()
  );
  const sendingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const streamedMessagesRef = useRef<MessageState[] | null>(null);
  const sessionDataRef = useRef<SessionData | null>(null);
  const itemToMessageRef = useRef<Map<string, string>>(new Map());
  const currentAssistantIdRef = useRef<string | null>(null);

  const isOptimistic = labSessionId === "new";

  const {
    data: sessionData,
    error: swrError,
    isLoading,
  } = useSWR<SessionData | null>(
    labSessionId && !isOptimistic ? getAgentMessagesKey(labSessionId) : null,
    () => fetchSessionData(labSessionId)
  );

  useEffect(() => {
    sessionDataRef.current = sessionData ?? null;
    streamedMessagesRef.current = streamedMessages;
    if (swrError) {
      setError(
        swrError instanceof Error ? swrError : new Error("Failed to initialize")
      );
    }
  }, [sessionData, streamedMessages, swrError]);

  const messages = streamedMessages ?? sessionData?.messages ?? [];
  const sandboxSessionId = sessionData?.sandboxSessionId ?? null;
  const lastSequence = sessionData?.lastSequence ?? 0;

  // SSE connection — connects once after replay data loads
  useEffect(() => {
    if (!sandboxSessionId) {
      return;
    }

    const abortController = new AbortController();
    const { signal } = abortController;

    const apiUrl = getAgentApiUrl();
    const params = new URLSearchParams({ sessionId: labSessionId });
    const offset = lastSequence;
    if (offset > 0) {
      params.set("offset", String(offset));
    }

    const eventsUrl = `${apiUrl}/sandbox-agent/events?${params}`;

    const seenSequences = new Set<number>();

    const handleItemStarted = (event: SandboxAgentEvent) => {
      const item = extractEventItem(event.data);
      const role =
        item.role === "user" ? ("user" as const) : ("assistant" as const);
      const itemId = extractItemId(item, `item-${event.sequence}`);

      if (role === "user") {
        itemToMessageRef.current.set(itemId, itemId);
        setStreamedMessages((previous) => {
          const base = previous ?? sessionDataRef.current?.messages ?? [];
          return [...base, { id: itemId, role, parts: [] }];
        });
        return;
      }

      if (shouldMergeItem(item) && currentAssistantIdRef.current) {
        itemToMessageRef.current.set(itemId, currentAssistantIdRef.current);
        return;
      }

      currentAssistantIdRef.current = itemId;
      itemToMessageRef.current.set(itemId, itemId);
      setStreamedMessages((previous) => {
        const base = previous ?? sessionDataRef.current?.messages ?? [];
        const existing = base.find((message) => message.id === itemId);
        if (existing) {
          return base;
        }
        return [...base, { id: itemId, role, parts: [] }];
      });
    };

    const handleItemDelta = (event: SandboxAgentEvent) => {
      const rawItemId = getString(event.data.item_id) || null;
      const deltaText = getString(event.data.delta) || null;

      if (!(rawItemId && deltaText)) {
        return;
      }

      const messageId = itemToMessageRef.current.get(rawItemId) ?? rawItemId;

      setStreamedMessages((previous) => {
        const base = previous ?? sessionDataRef.current?.messages ?? [];
        return base.map((message) => {
          if (message.id !== messageId) {
            return message;
          }

          const updatedParts = [...message.parts];
          const lastIndex = updatedParts.length - 1;
          const lastPart = updatedParts.at(-1);

          if (lastPart && lastPart.type === "text") {
            updatedParts[lastIndex] = {
              ...lastPart,
              text: lastPart.text + deltaText,
            };
          } else {
            updatedParts.push({ type: "text", text: deltaText });
          }

          return { ...message, parts: updatedParts };
        });
      });
    };

    const handleItemCompleted = (event: SandboxAgentEvent) => {
      const item = extractEventItem(event.data);
      const itemId = getString(item.item_id) || null;
      const content = normalizeContentParts(extractContentParts(item));

      if (!itemId || content.length === 0) {
        return;
      }

      const messageId = itemToMessageRef.current.get(itemId) ?? itemId;

      setStreamedMessages((previous) => {
        const base = previous ?? sessionDataRef.current?.messages ?? [];
        return base.map((message) => {
          if (message.id !== messageId) {
            return message;
          }
          if (messageId === itemId) {
            if (message.parts.length > 0) {
              return {
                ...message,
                parts: resolveToolCallStatuses(message.parts),
              };
            }
            return {
              ...message,
              parts: resolveToolCallStatuses([...content]),
            };
          }
          const newParts = [...message.parts, ...content];
          return {
            ...message,
            parts: resolveToolCallStatuses(newParts),
          };
        });
      });
    };

    const clearSendingTimeout = () => {
      if (sendingTimeoutRef.current) {
        clearTimeout(sendingTimeoutRef.current);
        sendingTimeoutRef.current = null;
      }
    };

    const handleTurnEnded = () => {
      clearSendingTimeout();
      setIsSending(false);
      setSessionStatus({ type: "idle" });

      if (streamedMessagesRef.current) {
        mutate(
          getAgentMessagesKey(labSessionId),
          (current: SessionData | null | undefined) => {
            if (!current) {
              return current;
            }
            return {
              ...current,
              messages: streamedMessagesRef.current ?? [],
            };
          },
          { revalidate: false }
        );
      }
    };

    const handleTurnStarted = () => {
      setSessionStatus({ type: "busy" });
    };

    const handleError = (event: SandboxAgentEvent) => {
      clearSendingTimeout();
      setIsSending(false);
      const message =
        typeof event.data.message === "string"
          ? event.data.message
          : "An error occurred";
      setSessionStatus({ type: "error", message });
    };

    const handleQuestionRequested = (event: SandboxAgentEvent) => {
      const questionId = getString(event.data.id) || null;
      const callId = getString(event.data.call_id) || null;
      if (questionId && callId) {
        setQuestionRequests((previous) =>
          new Map(previous).set(callId, questionId)
        );
      }
    };

    const handleQuestionResolved = (event: SandboxAgentEvent) => {
      const callId = getString(event.data.call_id) || null;
      if (callId) {
        setQuestionRequests((previous) => {
          const next = new Map(previous);
          next.delete(callId);
          return next;
        });
      }
    };

    const processEvent = (event: SandboxAgentEvent) => {
      if (seenSequences.has(event.sequence)) {
        return;
      }
      seenSequences.add(event.sequence);
      publish(event);

      switch (event.type) {
        case "turn.started":
          handleTurnStarted();
          break;
        case "turn.ended":
          handleTurnEnded();
          break;
        case "item.started":
          handleItemStarted(event);
          break;
        case "item.delta":
          handleItemDelta(event);
          break;
        case "item.completed":
          handleItemCompleted(event);
          break;
        case "error":
          handleError(event);
          break;
        case "question.requested":
          handleQuestionRequested(event);
          break;
        case "question.resolved":
          handleQuestionResolved(event);
          break;
        default:
          break;
      }
    };

    const connect = async () => {
      while (!signal.aborted) {
        try {
          const response = await fetch(eventsUrl, {
            headers: {
              Accept: "text/event-stream",
              "X-Lab-Session-Id": labSessionId,
            },
            signal,
          });

          if (!(response.ok && response.body)) {
            await new Promise((resolve) => setTimeout(resolve, 2000));
            continue;
          }

          await readSSEStream(response, processEvent);
        } catch (error) {
          if (signal.aborted) {
            return;
          }
          console.warn("SSE connection error, reconnecting:", error);
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }
      }
    };

    connect();

    return () => {
      abortController.abort();
    };
  }, [sandboxSessionId, labSessionId, lastSequence, mutate, publish]);

  const sendMessage = async ({
    content,
    modelId,
    attachments: _attachments,
  }: SendMessageOptions) => {
    if (!sandboxSessionId) {
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
      5 * 60 * 1000
    );

    try {
      const apiUrl = getAgentApiUrl();
      const body: Record<string, string> = {
        sessionId: sandboxSessionId,
        message: content,
      };
      if (modelId) {
        body.model = modelId;
      }
      const response = await fetch(`${apiUrl}/sandbox-agent/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Lab-Session-Id": labSessionId,
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        throw new Error(`Failed to send message: ${response.status}`);
      }
    } catch (error) {
      const errorInstance =
        error instanceof Error ? error : new Error("Failed to send message");
      setError(errorInstance);
      setIsSending(false);
      throw errorInstance;
    } finally {
      if (sendingTimeoutRef.current) {
        clearTimeout(sendingTimeoutRef.current);
        sendingTimeoutRef.current = null;
      }
    }
  };

  const abortSession = async () => {
    if (!sandboxSessionId) {
      return;
    }

    try {
      const apiUrl = getAgentApiUrl();
      await fetch(`${apiUrl}/sandbox-agent/sessions`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          "X-Lab-Session-Id": labSessionId,
        },
        body: JSON.stringify({ sessionId: sandboxSessionId }),
      });
    } catch (error) {
      console.warn("Failed to abort session:", error);
    }
  };

  return {
    isLoading,
    messages,
    error,
    sendMessage,
    abortSession,
    isSending,
    sessionStatus,
    questionRequests,
  };
}
