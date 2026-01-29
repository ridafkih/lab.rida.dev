"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { useSessionLifecycle } from "../session/use-session-lifecycle";
import { useOpenCodeState } from "./use-opencode-state";
import { usePermissions } from "./use-permissions";
import type {
  SessionState,
  MessageState,
  PermissionRequest,
  PermissionResponse,
} from "../state/types";
import { isTextPart } from "../events/guards";

type AgentState =
  | { status: "loading" }
  | { status: "inactive" }
  | { status: "active"; isProcessing: boolean };

interface RemoteMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

interface UseAgentResult {
  state: AgentState;
  sessionState: SessionState | null;
  messages: MessageState[];
  streamingContent: string | null;
  isSending: boolean;
  error: Error | null;
  sendMessage: (content: string, model?: { providerId: string; modelId: string }) => Promise<void>;
  addRemoteMessage: (message: RemoteMessage) => void;
  clearError: () => void;
  activePermission: PermissionRequest | null;
  respondToPermission: (permissionId: string, response: PermissionResponse) => Promise<void>;
}

export function useAgent(labSessionId: string): UseAgentResult {
  const {
    opencodeSessionId,
    opencodeClient,
    isInitializing,
    error: lifecycleError,
  } = useSessionLifecycle(labSessionId);

  const {
    state: uiState,
    sessionState,
    dispatch,
    loadMessages,
    clearError: clearStateError,
    pendingPermissions,
  } = useOpenCodeState({ sessionId: opencodeSessionId });

  const { activePermission, respondToPermission } = usePermissions({
    client: opencodeClient,
    sessionId: opencodeSessionId ?? "",
    pendingPermissions,
  });

  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const agentState: AgentState = useMemo(() => {
    if (isInitializing) {
      return { status: "loading" };
    }
    if (lifecycleError || !opencodeSessionId) {
      return { status: "inactive" };
    }
    const sessionStatus = sessionState?.status;
    const isProcessing = sessionStatus?.type === "busy" || isSending;
    return { status: "active", isProcessing };
  }, [isInitializing, lifecycleError, opencodeSessionId, sessionState?.status, isSending]);

  useEffect(() => {
    if (lifecycleError) {
      setError(lifecycleError);
    }
  }, [lifecycleError]);

  useEffect(() => {
    if (uiState.error) {
      setError(uiState.error);
      clearStateError();
    }
  }, [uiState.error, clearStateError]);

  useEffect(() => {
    if (opencodeSessionId && !isInitializing) {
      const fetchMessages = async () => {
        const messagesResponse = await opencodeClient.session.messages({
          path: { id: opencodeSessionId },
        });

        if (messagesResponse.data) {
          loadMessages(messagesResponse.data);
        }
      };
      fetchMessages();
    }
  }, [opencodeSessionId, isInitializing, opencodeClient, loadMessages]);

  useEffect(() => {
    if (sessionState?.status.type === "idle" && isSending) {
      setIsSending(false);
    }
  }, [sessionState?.status, isSending]);

  const messages = useMemo(() => {
    if (!sessionState) return [];
    return sessionState.messageOrder
      .map((id) => sessionState.messages.get(id))
      .filter((m): m is MessageState => m !== undefined);
  }, [sessionState]);

  const streamingContent = useMemo(() => {
    for (const message of messages) {
      if (message.info.role !== "assistant") continue;
      if (message.isStreaming && message.streamingPartId) {
        const partState = message.parts.get(message.streamingPartId);
        if (partState && isTextPart(partState.part)) {
          return partState.delta || partState.part.text;
        }
      }
    }
    return null;
  }, [messages]);

  const sendMessage = useCallback(
    async (content: string, model?: { providerId: string; modelId: string }) => {
      if (!opencodeSessionId) {
        throw new Error("Session not initialized");
      }

      setError(null);
      setIsSending(true);

      try {
        const promptResponse = await opencodeClient.session.promptAsync({
          path: { id: opencodeSessionId },
          body: {
            parts: [{ type: "text", text: content }],
            model: model ? { providerID: model.providerId, modelID: model.modelId } : undefined,
          },
        });

        if (promptResponse.error) {
          throw new Error(`OpenCode API error: ${JSON.stringify(promptResponse.error)}`);
        }
      } catch (sendError) {
        const errorInstance =
          sendError instanceof Error ? sendError : new Error("Failed to send message");
        setError(errorInstance);
        setIsSending(false);
        throw errorInstance;
      }
    },
    [opencodeSessionId, opencodeClient],
  );

  const clearError = useCallback(() => {
    setError(null);
    clearStateError();
  }, [clearStateError]);

  const addRemoteMessage = useCallback(
    (remoteMessage: RemoteMessage) => {
      if (!opencodeSessionId) return;

      dispatch({
        type: "REMOTE_MESSAGE_ADDED",
        payload: {
          id: remoteMessage.id,
          sessionId: opencodeSessionId,
          role: remoteMessage.role,
          content: remoteMessage.content,
          timestamp: remoteMessage.timestamp,
        },
      });
    },
    [opencodeSessionId, dispatch],
  );

  return {
    state: agentState,
    sessionState,
    messages,
    streamingContent,
    isSending,
    error,
    sendMessage,
    addRemoteMessage,
    clearError,
    activePermission,
    respondToPermission,
  };
}
