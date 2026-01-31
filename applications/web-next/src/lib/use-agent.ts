"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { createOpencodeClient, type Message, type Part } from "@opencode-ai/sdk/client";
import { api } from "./api";

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

interface UseAgentResult {
  isLoading: boolean;
  messages: MessageState[];
  error: Error | null;
  sendMessage: (options: SendMessageOptions) => Promise<void>;
  isSending: boolean;
}

export function useAgent(labSessionId: string): UseAgentResult {
  const [opencodeSessionId, setOpencodeSessionId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [messages, setMessages] = useState<MessageState[]>([]);
  const [error, setError] = useState<Error | null>(null);
  const [isSending, setIsSending] = useState(false);

  const opencodeClient = useMemo(() => {
    if (!labSessionId) return null;

    const apiUrl = process.env.NEXT_PUBLIC_API_URL;
    if (!apiUrl) throw new Error("NEXT_PUBLIC_API_URL must be set");

    return createOpencodeClient({
      baseUrl: `${apiUrl}/opencode`,
      headers: { "X-Lab-Session-Id": labSessionId },
    });
  }, [labSessionId]);

  useEffect(() => {
    if (!labSessionId || !opencodeClient) {
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    const initialize = async () => {
      try {
        setIsLoading(true);
        setError(null);

        const labSession = await api.sessions.get(labSessionId);
        let sessionId = labSession.opencodeSessionId;

        if (!sessionId) {
          const response = await opencodeClient.session.create({});
          if (response.error || !response.data) {
            throw new Error("Failed to create OpenCode session");
          }
          sessionId = response.data.id;
          await api.sessions.update(labSessionId, { opencodeSessionId: sessionId });
        }

        if (cancelled) return;
        setOpencodeSessionId(sessionId);

        const messagesResponse = await opencodeClient.session.messages({
          path: { id: sessionId },
        });

        if (cancelled) return;

        if (messagesResponse.data) {
          setMessages(
            messagesResponse.data.map((message: LoadedMessage) => ({
              id: message.info.id,
              role: message.info.role,
              parts: message.parts,
            })),
          );
        }

        setIsLoading(false);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err : new Error("Failed to initialize"));
        setIsLoading(false);
      }
    };

    initialize();

    return () => {
      cancelled = true;
    };
  }, [labSessionId, opencodeClient]);

  useEffect(() => {
    if (!opencodeSessionId || !opencodeClient) return;

    const abortController = new AbortController();

    const subscribe = async () => {
      try {
        const { stream } = await opencodeClient.event.subscribe({
          signal: abortController.signal,
        });

        for await (const event of stream) {
          if (abortController.signal.aborted) break;

          if (event.type === "message.updated") {
            const info = event.properties.info;
            setMessages((prev) => {
              const existing = prev.find((message) => message.id === info.id);
              if (existing) return prev;
              return [...prev, { id: info.id, role: info.role, parts: [] }];
            });
          }

          if (event.type === "message.part.updated") {
            const { part } = event.properties;
            setMessages((prev) =>
              prev.map((message) => {
                if (message.id !== part.messageID) return message;
                const partIndex = message.parts.findIndex((existing) => existing.id === part.id);
                if (partIndex === -1) {
                  return { ...message, parts: [...message.parts, part] };
                }
                const newParts = [...message.parts];
                newParts[partIndex] = part;
                return { ...message, parts: newParts };
              }),
            );
          }

          if (event.type === "session.idle") {
            setIsSending(false);
          }
        }
      } catch (err) {
        if (!abortController.signal.aborted) {
          console.error("Event stream error:", err);
        }
      }
    };

    subscribe();

    return () => {
      abortController.abort();
    };
  }, [opencodeSessionId, opencodeClient]);

  const sendMessage = useCallback(
    async ({ content, modelId }: SendMessageOptions) => {
      if (!opencodeSessionId || !opencodeClient) {
        throw new Error("Session not initialized");
      }

      setError(null);
      setIsSending(true);

      try {
        const [providerID, modelID] = modelId?.split("/") ?? [];
        const response = await opencodeClient.session.promptAsync({
          path: { id: opencodeSessionId },
          body: {
            parts: [{ type: "text", text: content }],
            model: providerID && modelID ? { providerID, modelID } : undefined,
          },
        });

        if (response.error) {
          throw new Error(`Failed to send message: ${JSON.stringify(response.error)}`);
        }
      } catch (err) {
        const error = err instanceof Error ? err : new Error("Failed to send message");
        setError(error);
        setIsSending(false);
        throw error;
      }
    },
    [opencodeSessionId, opencodeClient],
  );

  return {
    isLoading,
    messages,
    error,
    sendMessage,
    isSending,
  };
}
