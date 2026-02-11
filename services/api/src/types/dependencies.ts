import type { AppSchema } from "@lab/multiplayer-sdk";
import type { Publisher as PublisherBase } from "@lab/multiplayer-server";
import type { Widelog as WidelogBase } from "@lab/widelogger";

export type { Sandbox } from "@lab/sandbox-sdk";

export interface SandboxAgentClient {
  baseUrl: string;
  createSession(
    sessionId: string,
    config: {
      agent: string;
      permissionMode?: string;
      model?: string;
      systemPrompt?: string;
    }
  ): Promise<void>;
  postMessage(sessionId: string, message: string): Promise<void>;
  streamEvents(
    sessionId: string,
    options?: { offset?: number; signal?: AbortSignal }
  ): AsyncIterable<SandboxAgentEvent>;
  getEvents(
    sessionId: string,
    options?: { offset?: number }
  ): Promise<SandboxAgentEvent[]>;
  deleteSession(sessionId: string): Promise<void>;
  replyPermission(
    sessionId: string,
    permissionId: string,
    reply: "once" | "always" | "reject"
  ): Promise<void>;
  replyQuestion(
    sessionId: string,
    questionId: string,
    answers: Record<string, string>
  ): Promise<void>;
  rejectQuestion(sessionId: string, questionId: string): Promise<void>;
  listAgents(): Promise<SandboxAgentInfo[]>;
  listModels(agent: string): Promise<SandboxAgentModel[]>;
  readFile(path: string): Promise<string>;
}

export interface SandboxAgentEvent {
  type: string;
  sequence: number;
  data: Record<string, unknown>;
}

export interface SandboxAgentInfo {
  id: string;
  name: string;
  installed: boolean;
  capabilities: {
    permissions: boolean;
    questions: boolean;
  };
}

export interface SandboxAgentModel {
  id: string;
  name: string;
}

export interface ContentPart {
  type: string;
  [key: string]: unknown;
}

export interface SandboxAgentItem {
  id: string;
  role: "user" | "assistant";
  status: "in_progress" | "completed";
  content: ContentPart[];
}

export type Publisher = PublisherBase<AppSchema>;
export type Widelog = WidelogBase;
