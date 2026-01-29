import type { Session, Message, Part, Permission, SessionStatus } from "@opencode-ai/sdk/client";

export type { Session, Message, Part, Permission, SessionStatus };

export type ConnectionStatus = "connecting" | "connected" | "disconnected" | "reconnecting";

export interface SyntheticMessageInfo {
  id: string;
  sessionID: string;
  role: "user" | "assistant";
  time: { created: number };
}

export type MessageInfo = Message | SyntheticMessageInfo;

export interface UIState {
  sessions: Map<string, SessionState>;
  activeSessionId: string | null;
  pendingPermissions: Map<string, PermissionRequest>;
  connectionStatus: ConnectionStatus;
  error: Error | null;
}

export interface SessionState {
  info: Session | null;
  status: SessionStatus;
  messages: Map<string, MessageState>;
  messageOrder: string[];
}

export interface MessageState {
  info: MessageInfo;
  parts: Map<string, PartState>;
  partOrder: string[];
  isStreaming: boolean;
  streamingPartId: string | null;
  isSynthetic?: boolean;
}

export interface PartState {
  part: Part;
  delta: string;
  isComplete: boolean;
}

export interface PermissionRequest {
  permission: Permission;
  sessionId: string;
}

export type PermissionResponse = "once" | "always" | "reject";
