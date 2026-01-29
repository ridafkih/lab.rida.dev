"use client";

import { useReducer, useEffect, useCallback, useMemo } from "react";
import type { Event } from "@opencode-ai/sdk/client";
import { useOpenCodeEvents } from "../events/provider";
import { createActionsFromEvent } from "../events/handlers";
import { getSessionIdFromEvent } from "../events/utils";
import { opencodeReducer } from "../state/reducer";
import { createInitialState } from "../state/initial-state";
import type { UIState, SessionState, PermissionRequest } from "../state/types";
import type { OpenCodeAction, LoadedMessage } from "../state/actions";

interface UseOpenCodeStateOptions {
  sessionId: string | null;
}

interface UseOpenCodeStateResult {
  state: UIState;
  sessionState: SessionState | null;
  dispatch: (action: OpenCodeAction) => void;
  loadMessages: (messages: LoadedMessage[]) => void;
  setActiveSession: (sessionId: string | null) => void;
  clearError: () => void;
  pendingPermissions: PermissionRequest[];
}

export function useOpenCodeState({ sessionId }: UseOpenCodeStateOptions): UseOpenCodeStateResult {
  const [state, dispatch] = useReducer(opencodeReducer, undefined, createInitialState);
  const { subscribe, connectionStatus } = useOpenCodeEvents();

  useEffect(() => {
    dispatch({ type: "CONNECTION_STATUS_CHANGED", payload: { status: connectionStatus } });
  }, [connectionStatus]);

  useEffect(() => {
    if (sessionId) {
      dispatch({ type: "SET_ACTIVE_SESSION", payload: { sessionId } });
    }
  }, [sessionId]);

  useEffect(() => {
    const handleEvent = (event: Event) => {
      const eventSessionId = getSessionIdFromEvent(event);

      if (sessionId && eventSessionId && eventSessionId !== sessionId) {
        return;
      }

      const actions = createActionsFromEvent(event);
      for (const action of actions) {
        dispatch(action);
      }
    };

    return subscribe(handleEvent);
  }, [subscribe, sessionId]);

  const sessionState = useMemo(() => {
    if (!sessionId) return null;
    return state.sessions.get(sessionId) ?? null;
  }, [state.sessions, sessionId]);

  const loadMessages = useCallback(
    (messages: LoadedMessage[]) => {
      if (!sessionId) return;
      dispatch({ type: "MESSAGES_LOADED", payload: { sessionId, messages } });
    },
    [sessionId],
  );

  const setActiveSession = useCallback((newSessionId: string | null) => {
    dispatch({ type: "SET_ACTIVE_SESSION", payload: { sessionId: newSessionId } });
  }, []);

  const clearError = useCallback(() => {
    dispatch({ type: "ERROR_CLEARED" });
  }, []);

  const pendingPermissions = useMemo(() => {
    const permissions: PermissionRequest[] = [];
    for (const [, permission] of state.pendingPermissions) {
      if (!sessionId || permission.sessionId === sessionId) {
        permissions.push(permission);
      }
    }
    return permissions;
  }, [state.pendingPermissions, sessionId]);

  return {
    state,
    sessionState,
    dispatch,
    loadMessages,
    setActiveSession,
    clearError,
    pendingPermissions,
  };
}
