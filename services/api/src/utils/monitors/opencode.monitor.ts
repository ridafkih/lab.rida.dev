import { opencode } from "../../clients/opencode";
import { TIMING } from "../../config/constants";
import { getChangeType } from "../../types/file";
import { formatWorkspacePath } from "../../types/session";
import { getAllSessionsWithOpencodeId } from "../repositories/session.repository";
import { publisher } from "../../clients/publisher";

interface FileDiff {
  file: string;
  before: string;
  after: string;
  additions: number;
  deletions: number;
}

interface MessagePart {
  type: string;
  text?: string;
}

interface SessionDiffEvent {
  type: "session.diff";
  properties: { diff: FileDiff[] };
}

interface MessageUpdatedEvent {
  type: "message.updated";
  properties: { parts: MessagePart[] };
}

interface MessagePartUpdatedEvent {
  type: "message.part.updated";
  properties: { part: MessagePart };
}

function hasProperty<T extends string>(obj: unknown, key: T): obj is Record<T, unknown> {
  return typeof obj === "object" && obj !== null && key in obj;
}

function parseSessionDiffEvent(event: unknown): SessionDiffEvent | null {
  if (!hasProperty(event, "type") || event.type !== "session.diff") return null;
  if (!hasProperty(event, "properties")) return null;
  if (!hasProperty(event.properties, "diff")) return null;
  if (!Array.isArray(event.properties.diff)) return null;
  return { type: "session.diff", properties: { diff: event.properties.diff } };
}

function parseMessageUpdatedEvent(event: unknown): MessageUpdatedEvent | null {
  if (!hasProperty(event, "type") || event.type !== "message.updated") return null;
  if (!hasProperty(event, "properties")) return null;
  if (!hasProperty(event.properties, "parts")) return null;
  if (!Array.isArray(event.properties.parts)) return null;
  return { type: "message.updated", properties: { parts: event.properties.parts } };
}

function parseMessagePartUpdatedEvent(event: unknown): MessagePartUpdatedEvent | null {
  if (!hasProperty(event, "type") || event.type !== "message.part.updated") return null;
  if (!hasProperty(event, "properties")) return null;
  if (!hasProperty(event.properties, "part")) return null;
  return {
    type: "message.part.updated",
    properties: { part: event.properties.part as MessagePart },
  };
}

function toReviewableFile(diff: FileDiff) {
  return {
    path: diff.file,
    originalContent: diff.before,
    currentContent: diff.after,
    status: "pending" as const,
    changeType: getChangeType(diff.before, diff.after),
  };
}

function extractTextFromParts(parts: MessagePart[]): string | null {
  const textPart = parts.find((part) => part.type === "text" && part.text);
  return textPart?.text ?? null;
}

function processSessionDiff(labSessionId: string, event: SessionDiffEvent): void {
  for (const diff of event.properties.diff) {
    publisher.publishDelta(
      "sessionChangedFiles",
      { uuid: labSessionId },
      { type: "add", file: toReviewableFile(diff) },
    );
  }
}

function processMessageUpdated(labSessionId: string, event: MessageUpdatedEvent): void {
  const text = extractTextFromParts(event.properties.parts);
  if (text) {
    publisher.publishDelta("sessionMetadata", { uuid: labSessionId }, { lastMessage: text });
  }
}

function processMessagePartUpdated(labSessionId: string, event: MessagePartUpdatedEvent): void {
  const part = event.properties.part;
  if (part.type === "text" && part.text) {
    publisher.publishDelta("sessionMetadata", { uuid: labSessionId }, { lastMessage: part.text });
  }
}

function processEvent(labSessionId: string, event: unknown): void {
  const diffEvent = parseSessionDiffEvent(event);
  if (diffEvent) {
    processSessionDiff(labSessionId, diffEvent);
    return;
  }

  const messageEvent = parseMessageUpdatedEvent(event);
  if (messageEvent) {
    processMessageUpdated(labSessionId, messageEvent);
    return;
  }

  const partEvent = parseMessagePartUpdatedEvent(event);
  if (partEvent) {
    processMessagePartUpdated(labSessionId, partEvent);
  }
}

class SessionTracker {
  private readonly abortController = new AbortController();

  constructor(
    readonly labSessionId: string,
    readonly opencodeSessionId: string,
  ) {
    this.monitor();
  }

  stop(): void {
    this.abortController.abort();
  }

  get isActive(): boolean {
    return !this.abortController.signal.aborted;
  }

  private async monitor(): Promise<void> {
    const directory = formatWorkspacePath(this.labSessionId);

    while (this.isActive) {
      try {
        const { stream } = await opencode.event.subscribe(
          { directory },
          { signal: this.abortController.signal },
        );
        if (!stream) return;

        for await (const event of stream) {
          if (!this.isActive) break;
          processEvent(this.labSessionId, event);
        }
      } catch (error) {
        if (!this.isActive) return;
        console.error(`[OpenCode Monitor] Error for ${this.labSessionId}:`, error);
        await new Promise((resolve) => setTimeout(resolve, TIMING.OPENCODE_MONITOR_RETRY_MS));
      }
    }
  }
}

class OpenCodeMonitor {
  private readonly trackers = new Map<string, SessionTracker>();
  private readonly abortController = new AbortController();

  async start(): Promise<void> {
    console.log("[OpenCode Monitor] Starting...");

    try {
      await this.syncSessions();
    } catch (error) {
      console.error("[OpenCode Monitor] Initial sync failed:", error);
    }

    this.runSyncLoop();
  }

  stop(): void {
    console.log("[OpenCode Monitor] Stopping...");
    this.abortController.abort();

    for (const tracker of this.trackers.values()) {
      tracker.stop();
    }
    this.trackers.clear();
  }

  private async runSyncLoop(): Promise<void> {
    while (!this.abortController.signal.aborted) {
      await new Promise((resolve) => setTimeout(resolve, TIMING.OPENCODE_SYNC_INTERVAL_MS));
      if (this.abortController.signal.aborted) return;

      try {
        await this.syncSessions();
      } catch (error) {
        console.error("[OpenCode Monitor] Sync failed:", error);
      }
    }
  }

  private async syncSessions(): Promise<void> {
    const active = await getAllSessionsWithOpencodeId();
    const activeIds = new Set(active.map((session) => session.id));

    for (const [id, tracker] of this.trackers) {
      if (!activeIds.has(id)) {
        tracker.stop();
        this.trackers.delete(id);
      }
    }

    for (const { id, opencodeSessionId } of active) {
      if (opencodeSessionId && !this.trackers.has(id)) {
        this.trackers.set(id, new SessionTracker(id, opencodeSessionId));
      }
    }
  }
}

export function createOpenCodeMonitor() {
  const monitor = new OpenCodeMonitor();
  return {
    start: () => monitor.start(),
    stop: () => monitor.stop(),
  };
}
