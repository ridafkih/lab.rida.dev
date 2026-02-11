/**
 * Type guards and utilities for Sandbox Agent message parsing.
 * Used by orchestration tools that interact with Sandbox Agent sessions.
 */

import type { SandboxAgentClientResolver } from "../sandbox-agent/client-resolver";
import type { SandboxAgentEvent } from "../types/dependencies";
import { MESSAGE_ROLE, type MessageRole } from "../types/message";

export interface ReconstructedMessage {
  role: MessageRole;
  content: string;
}

function isTextPart(value: unknown): value is { type: "text"; text: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as Record<string, unknown>).type === "text" &&
    typeof (value as Record<string, unknown>).text === "string"
  );
}

function collectText(parts: unknown[]): string {
  const texts: string[] = [];
  for (const part of parts) {
    if (isTextPart(part)) {
      texts.push(part.text);
    }
  }
  return texts.join("");
}

interface ExtractionState {
  messages: ReconstructedMessage[];
  currentRole: MessageRole;
  currentText: string;
  inItem: boolean;
}

function flushCurrentItem(state: ExtractionState): void {
  if (state.inItem && state.currentText.trim()) {
    state.messages.push({
      role: state.currentRole,
      content: state.currentText.trim(),
    });
  }
}

function processExtractionEvent(
  event: SandboxAgentEvent,
  state: ExtractionState
): void {
  if (event.type === "item.started") {
    flushCurrentItem(state);
    state.currentText = "";
    state.inItem = true;
    const role = event.data.role;
    state.currentRole =
      role === "user" ? MESSAGE_ROLE.USER : MESSAGE_ROLE.ASSISTANT;
    return;
  }

  if (event.type === "item.delta" && Array.isArray(event.data.deltas)) {
    state.currentText += collectText(event.data.deltas);
    return;
  }

  if (event.type === "item.completed" && Array.isArray(event.data.content)) {
    const itemText = collectText(event.data.content);
    if (itemText) {
      state.currentText = itemText;
    }
  }
}

export function extractTextFromEvents(
  events: SandboxAgentEvent[]
): ReconstructedMessage[] {
  const state: ExtractionState = {
    messages: [],
    currentRole: MESSAGE_ROLE.ASSISTANT,
    currentText: "",
    inItem: false,
  };

  for (const event of events) {
    processExtractionEvent(event, state);
  }

  flushCurrentItem(state);
  return state.messages;
}

export async function fetchSessionMessages(
  sandboxAgentResolver: SandboxAgentClientResolver,
  labSessionId: string,
  sandboxSessionId: string
): Promise<ReconstructedMessage[]> {
  const sandboxAgent = await sandboxAgentResolver.getClient(labSessionId);
  const events = await sandboxAgent.getEvents(sandboxSessionId);
  return extractTextFromEvents(events);
}
