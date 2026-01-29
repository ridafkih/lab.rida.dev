import type {
  UIState,
  SessionState,
  MessageState,
  PartState,
  SyntheticMessageInfo,
  Part,
  MessageInfo,
} from "./types";
import type { OpenCodeAction, LoadedMessage } from "./actions";

function createSessionState(): SessionState {
  return {
    info: null,
    status: { type: "idle" },
    messages: new Map(),
    messageOrder: [],
  };
}

function createMessageState(info: MessageInfo): MessageState {
  return {
    info,
    parts: new Map(),
    partOrder: [],
    isStreaming: false,
    streamingPartId: null,
  };
}

function createMessageStateWithParts(loadedMessage: LoadedMessage): MessageState {
  const parts = new Map<string, PartState>();
  const partOrder: string[] = [];

  for (const part of loadedMessage.parts) {
    const partText = "text" in part ? (part.text ?? "") : "";
    parts.set(part.id, {
      part,
      delta: partText,
      isComplete: true,
    });
    partOrder.push(part.id);
  }

  return {
    info: loadedMessage.info,
    parts,
    partOrder,
    isStreaming: false,
    streamingPartId: null,
  };
}

function createPartState(part: Part): PartState {
  return {
    part,
    delta: "",
    isComplete: false,
  };
}

function updateMap<K, V>(map: Map<K, V>, key: K, updater: (value: V) => V): Map<K, V> {
  const existing = map.get(key);
  if (!existing) return map;
  const newMap = new Map(map);
  newMap.set(key, updater(existing));
  return newMap;
}

function ensureSessionExists(state: UIState, sessionId: string): UIState {
  if (state.sessions.has(sessionId)) return state;
  const newSessions = new Map(state.sessions);
  newSessions.set(sessionId, createSessionState());
  return { ...state, sessions: newSessions };
}

export function opencodeReducer(state: UIState, action: OpenCodeAction): UIState {
  switch (action.type) {
    case "SESSION_CREATED":
    case "SESSION_UPDATED": {
      const { session } = action.payload;
      const stateWithSession = ensureSessionExists(state, session.id);
      return {
        ...stateWithSession,
        sessions: updateMap(stateWithSession.sessions, session.id, (sessionState) => ({
          ...sessionState,
          info: session,
        })),
      };
    }

    case "SESSION_STATUS_CHANGED": {
      const { sessionId, status } = action.payload;
      const stateWithSession = ensureSessionExists(state, sessionId);
      return {
        ...stateWithSession,
        sessions: updateMap(stateWithSession.sessions, sessionId, (sessionState) => ({
          ...sessionState,
          status,
        })),
      };
    }

    case "SESSION_IDLE": {
      const { sessionId } = action.payload;
      const stateWithSession = ensureSessionExists(state, sessionId);
      return {
        ...stateWithSession,
        sessions: updateMap(stateWithSession.sessions, sessionId, (sessionState) => {
          const updatedMessages = new Map(sessionState.messages);
          for (const [messageId, messageState] of updatedMessages) {
            if (messageState.isStreaming) {
              updatedMessages.set(messageId, {
                ...messageState,
                isStreaming: false,
                streamingPartId: null,
              });
            }
          }
          return {
            ...sessionState,
            status: { type: "idle" },
            messages: updatedMessages,
          };
        }),
      };
    }

    case "SESSION_DELETED": {
      const { sessionId } = action.payload;
      const newSessions = new Map(state.sessions);
      newSessions.delete(sessionId);
      const newPermissions = new Map(state.pendingPermissions);
      for (const [permId, perm] of newPermissions) {
        if (perm.sessionId === sessionId) {
          newPermissions.delete(permId);
        }
      }
      return {
        ...state,
        sessions: newSessions,
        pendingPermissions: newPermissions,
        activeSessionId: state.activeSessionId === sessionId ? null : state.activeSessionId,
      };
    }

    case "MESSAGE_UPDATED": {
      const { message } = action.payload;
      const sessionId = message.sessionID;
      const stateWithSession = ensureSessionExists(state, sessionId);

      return {
        ...stateWithSession,
        sessions: updateMap(stateWithSession.sessions, sessionId, (sessionState) => {
          const existingMessage = sessionState.messages.get(message.id);
          const newMessages = new Map(sessionState.messages);

          if (existingMessage) {
            newMessages.set(message.id, {
              ...existingMessage,
              info: message,
              isSynthetic: false,
            });
          } else {
            newMessages.set(message.id, createMessageState(message));
          }

          const messageOrder = sessionState.messageOrder.includes(message.id)
            ? sessionState.messageOrder
            : [...sessionState.messageOrder, message.id];

          return {
            ...sessionState,
            messages: newMessages,
            messageOrder,
          };
        }),
      };
    }

    case "MESSAGE_REMOVED": {
      const { sessionId, messageId } = action.payload;
      if (!state.sessions.has(sessionId)) return state;

      return {
        ...state,
        sessions: updateMap(state.sessions, sessionId, (sessionState) => {
          const newMessages = new Map(sessionState.messages);
          newMessages.delete(messageId);
          return {
            ...sessionState,
            messages: newMessages,
            messageOrder: sessionState.messageOrder.filter((id) => id !== messageId),
          };
        }),
      };
    }

    case "MESSAGES_LOADED": {
      const { sessionId, messages } = action.payload;
      const stateWithSession = ensureSessionExists(state, sessionId);

      return {
        ...stateWithSession,
        sessions: updateMap(stateWithSession.sessions, sessionId, (sessionState) => {
          const newMessages = new Map<string, MessageState>();
          const messageOrder: string[] = [];
          const loadedIds = new Set(messages.map((loadedMessage) => loadedMessage.info.id));

          for (const loadedMessage of messages) {
            const messageId = loadedMessage.info.id;
            const existingMessage = sessionState.messages.get(messageId);
            newMessages.set(
              messageId,
              existingMessage ?? createMessageStateWithParts(loadedMessage),
            );
            messageOrder.push(messageId);
          }

          for (const [messageId, messageState] of sessionState.messages) {
            if (messageState.isSynthetic && !loadedIds.has(messageId)) {
              newMessages.set(messageId, messageState);
              messageOrder.push(messageId);
            }
          }

          return {
            ...sessionState,
            messages: newMessages,
            messageOrder,
          };
        }),
      };
    }

    case "REMOTE_MESSAGE_ADDED": {
      const { id, sessionId, role, content, timestamp } = action.payload;
      const stateWithSession = ensureSessionExists(state, sessionId);

      return {
        ...stateWithSession,
        sessions: updateMap(stateWithSession.sessions, sessionId, (sessionState) => {
          if (sessionState.messages.has(id)) return sessionState;

          const syntheticMessage: SyntheticMessageInfo = {
            id,
            sessionID: sessionId,
            role,
            time: { created: timestamp },
          };

          const textPartId = `${id}-text`;
          const messageState: MessageState = {
            info: syntheticMessage,
            parts: new Map([
              [
                textPartId,
                {
                  part: {
                    id: textPartId,
                    sessionID: sessionId,
                    messageID: id,
                    type: "text" as const,
                    text: content,
                  },
                  delta: content,
                  isComplete: true,
                },
              ],
            ]),
            partOrder: [textPartId],
            isStreaming: false,
            streamingPartId: null,
            isSynthetic: true,
          };

          const newMessages = new Map(sessionState.messages);
          newMessages.set(id, messageState);

          return {
            ...sessionState,
            messages: newMessages,
            messageOrder: [...sessionState.messageOrder, id],
          };
        }),
      };
    }

    case "PART_UPDATED": {
      const { part, delta } = action.payload;
      const { sessionID: sessionId, messageID: messageId, id: partId } = part;
      const stateWithSession = ensureSessionExists(state, sessionId);

      return {
        ...stateWithSession,
        sessions: updateMap(stateWithSession.sessions, sessionId, (sessionState) => {
          const existingMessage = sessionState.messages.get(messageId);
          if (!existingMessage) return sessionState;

          const existingPart = existingMessage.parts.get(partId);
          const newParts = new Map(existingMessage.parts);

          const isStreamingPart = part.type === "text" || part.type === "reasoning";
          const hasTime = "time" in part && part.time;
          const isComplete =
            hasTime && typeof hasTime === "object" && "end" in hasTime && hasTime.end !== undefined;

          if (existingPart) {
            newParts.set(partId, {
              part,
              delta: delta ? existingPart.delta + delta : existingPart.delta,
              isComplete: isComplete ?? existingPart.isComplete,
            });
          } else {
            newParts.set(partId, {
              ...createPartState(part),
              delta: delta ?? "",
              isComplete: isComplete ?? false,
            });
          }

          const partOrder = existingMessage.partOrder.includes(partId)
            ? existingMessage.partOrder
            : [...existingMessage.partOrder, partId];

          const isStreaming = isStreamingPart && !isComplete;
          const streamingPartId = isStreaming
            ? partId
            : existingMessage.streamingPartId === partId
              ? null
              : existingMessage.streamingPartId;

          return {
            ...sessionState,
            messages: updateMap(sessionState.messages, messageId, (msgState) => ({
              ...msgState,
              parts: newParts,
              partOrder,
              isStreaming:
                isStreaming || (msgState.isStreaming && msgState.streamingPartId !== partId),
              streamingPartId,
            })),
          };
        }),
      };
    }

    case "PART_REMOVED": {
      const { sessionId, messageId, partId } = action.payload;
      if (!state.sessions.has(sessionId)) return state;

      return {
        ...state,
        sessions: updateMap(state.sessions, sessionId, (sessionState) => {
          const existingMessage = sessionState.messages.get(messageId);
          if (!existingMessage) return sessionState;

          const newParts = new Map(existingMessage.parts);
          newParts.delete(partId);

          return {
            ...sessionState,
            messages: updateMap(sessionState.messages, messageId, (msgState) => ({
              ...msgState,
              parts: newParts,
              partOrder: msgState.partOrder.filter((id) => id !== partId),
              streamingPartId:
                msgState.streamingPartId === partId ? null : msgState.streamingPartId,
            })),
          };
        }),
      };
    }

    case "PERMISSION_REQUESTED": {
      const { permission } = action.payload;
      const newPermissions = new Map(state.pendingPermissions);
      newPermissions.set(permission.id, {
        permission,
        sessionId: permission.sessionID,
      });
      return {
        ...state,
        pendingPermissions: newPermissions,
      };
    }

    case "PERMISSION_REPLIED": {
      const { permissionId } = action.payload;
      const newPermissions = new Map(state.pendingPermissions);
      newPermissions.delete(permissionId);
      return {
        ...state,
        pendingPermissions: newPermissions,
      };
    }

    case "CONNECTION_STATUS_CHANGED": {
      return {
        ...state,
        connectionStatus: action.payload.status,
      };
    }

    case "ERROR_SET": {
      return {
        ...state,
        error: action.payload.error,
      };
    }

    case "ERROR_CLEARED": {
      return {
        ...state,
        error: null,
      };
    }

    case "SET_ACTIVE_SESSION": {
      return {
        ...state,
        activeSessionId: action.payload.sessionId,
      };
    }

    default:
      return state;
  }
}
