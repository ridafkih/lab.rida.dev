import type { Session, Message, Part, Permission, SessionStatus, ConnectionStatus } from "./types";

export interface RemoteMessagePayload {
  id: string;
  sessionId: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

export interface LoadedMessage {
  info: Message;
  parts: Part[];
}

export type OpenCodeAction =
  | { type: "SESSION_CREATED"; payload: { session: Session } }
  | { type: "SESSION_UPDATED"; payload: { session: Session } }
  | { type: "SESSION_STATUS_CHANGED"; payload: { sessionId: string; status: SessionStatus } }
  | { type: "SESSION_IDLE"; payload: { sessionId: string } }
  | { type: "SESSION_DELETED"; payload: { sessionId: string } }
  | { type: "MESSAGE_UPDATED"; payload: { message: Message } }
  | { type: "MESSAGE_REMOVED"; payload: { sessionId: string; messageId: string } }
  | { type: "MESSAGES_LOADED"; payload: { sessionId: string; messages: LoadedMessage[] } }
  | { type: "REMOTE_MESSAGE_ADDED"; payload: RemoteMessagePayload }
  | { type: "PART_UPDATED"; payload: { part: Part; delta?: string } }
  | { type: "PART_REMOVED"; payload: { sessionId: string; messageId: string; partId: string } }
  | { type: "PERMISSION_REQUESTED"; payload: { permission: Permission } }
  | { type: "PERMISSION_REPLIED"; payload: { sessionId: string; permissionId: string } }
  | { type: "CONNECTION_STATUS_CHANGED"; payload: { status: ConnectionStatus } }
  | { type: "ERROR_SET"; payload: { error: Error } }
  | { type: "ERROR_CLEARED" }
  | { type: "SET_ACTIVE_SESSION"; payload: { sessionId: string | null } };
