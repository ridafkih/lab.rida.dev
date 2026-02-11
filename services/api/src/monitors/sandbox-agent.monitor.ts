import { TIMING } from "../config/constants";
import { widelog } from "../logging";
import {
  findRunningSessions,
  findSessionById,
} from "../repositories/session.repository";
import type { SandboxAgentClientResolver } from "../sandbox-agent/client-resolver";
import {
  extractTextFromEvent,
  isKnownEventType,
} from "../sandbox-agent/event-parser";
import {
  publishInferenceStatus,
  publishSessionCompletion,
} from "../sandbox-agent/publisher-adapter";
import type { DeferredPublisher } from "../shared/deferred-publisher";
import {
  INFERENCE_STATUS,
  type SessionStateStore,
} from "../state/session-state-store";
import type { Publisher, SandboxAgentClient } from "../types/dependencies";

class CompletionTimerManager {
  private readonly timers = new Map<string, NodeJS.Timeout>();
  private readonly completedSessions = new Set<string>();

  private readonly getPublisher: () => Publisher;

  constructor(getPublisher: () => Publisher) {
    this.getPublisher = getPublisher;
  }

  scheduleCompletion(sessionId: string): void {
    if (this.completedSessions.has(sessionId)) {
      return;
    }

    this.cancelCompletion(sessionId);

    const timer = setTimeout(() => {
      widelog.context(() => {
        widelog.set("event_name", "sandbox_agent_monitor.session_completion");
        widelog.set("session_id", sessionId);
        widelog.set("debounce_ms", TIMING.COMPLETION_DEBOUNCE_MS);

        this.timers.delete(sessionId);
        this.completedSessions.add(sessionId);
        publishSessionCompletion(this.getPublisher(), sessionId);

        widelog.flush();
      });
    }, TIMING.COMPLETION_DEBOUNCE_MS);

    this.timers.set(sessionId, timer);
  }

  cancelCompletion(sessionId: string): void {
    const existing = this.timers.get(sessionId);
    if (existing) {
      clearTimeout(existing);
      this.timers.delete(sessionId);
    }
  }

  clearSession(sessionId: string): void {
    this.cancelCompletion(sessionId);
    this.completedSessions.delete(sessionId);
  }
}

class SessionTracker {
  private readonly abortController = new AbortController();

  readonly labSessionId: string;
  private readonly sandboxAgentResolver: SandboxAgentClientResolver;
  private readonly getPublisher: () => Publisher;
  private readonly completionTimerManager: CompletionTimerManager;
  private readonly sessionStateStore: SessionStateStore;

  constructor(
    labSessionId: string,
    sandboxAgentResolver: SandboxAgentClientResolver,
    getPublisher: () => Publisher,
    completionTimerManager: CompletionTimerManager,
    sessionStateStore: SessionStateStore
  ) {
    this.labSessionId = labSessionId;
    this.sandboxAgentResolver = sandboxAgentResolver;
    this.getPublisher = getPublisher;
    this.completionTimerManager = completionTimerManager;
    this.sessionStateStore = sessionStateStore;
    this.monitor();
  }

  stop(): void {
    this.abortController.abort();
    this.sessionStateStore.clear(this.labSessionId);
    this.completionTimerManager.clearSession(this.labSessionId);
  }

  get isActive(): boolean {
    return !this.abortController.signal.aborted;
  }

  private async monitor(): Promise<void> {
    while (this.isActive) {
      try {
        const session = await findSessionById(this.labSessionId);
        if (!session?.sandboxSessionId) {
          await new Promise((resolve) =>
            setTimeout(resolve, TIMING.SANDBOX_AGENT_MONITOR_RETRY_MS)
          );
          continue;
        }

        let client: SandboxAgentClient | null = null;
        try {
          client = await this.sandboxAgentResolver.getClient(this.labSessionId);
        } catch {
          await new Promise((resolve) =>
            setTimeout(resolve, TIMING.SANDBOX_AGENT_MONITOR_RETRY_MS)
          );
          continue;
        }

        const events = client.streamEvents(session.sandboxSessionId, {
          signal: this.abortController.signal,
        });

        for await (const event of events) {
          if (!this.isActive) {
            break;
          }
          await this.processEvent(event);
        }
      } catch (error) {
        if (!this.isActive) {
          return;
        }
        widelog.context(() => {
          widelog.set(
            "event_name",
            "sandbox_agent_monitor.session_tracker_error"
          );
          widelog.set("session_id", this.labSessionId);
          widelog.set("retry_delay_ms", TIMING.SANDBOX_AGENT_MONITOR_RETRY_MS);
          widelog.set("outcome", "error");
          widelog.errorFields(error);
          widelog.flush();
        });

        await new Promise((resolve) =>
          setTimeout(resolve, TIMING.SANDBOX_AGENT_MONITOR_RETRY_MS)
        );
      }
    }
  }

  private async processEvent(event: {
    type: string;
    sequence: number;
    data: Record<string, unknown>;
  }): Promise<void> {
    if (!isKnownEventType(event.type)) {
      return;
    }

    switch (event.type) {
      case "turn.started":
      case "item.started":
      case "item.delta":
        await this.handleActivity(event);
        break;

      case "turn.ended":
        await this.handleTurnEnded();
        break;

      case "item.completed":
        // Track file references for diffs if needed
        break;

      case "error":
        await this.handleError();
        break;

      default:
        break;
    }
  }

  private async handleActivity(event: {
    type: string;
    data: Record<string, unknown>;
  }): Promise<void> {
    this.completionTimerManager.cancelCompletion(this.labSessionId);
    await this.sessionStateStore.setInferenceStatus(
      this.labSessionId,
      INFERENCE_STATUS.GENERATING
    );

    const text = extractTextFromEvent(event as never);
    if (text) {
      await this.sessionStateStore.setLastMessage(this.labSessionId, text);
    }

    publishInferenceStatus(
      this.getPublisher(),
      this.labSessionId,
      INFERENCE_STATUS.GENERATING,
      text ?? undefined
    );
  }

  private async handleTurnEnded(): Promise<void> {
    await this.sessionStateStore.setInferenceStatus(
      this.labSessionId,
      INFERENCE_STATUS.IDLE
    );
    publishInferenceStatus(
      this.getPublisher(),
      this.labSessionId,
      INFERENCE_STATUS.IDLE
    );
    this.completionTimerManager.scheduleCompletion(this.labSessionId);
  }

  private async handleError(): Promise<void> {
    await this.sessionStateStore.setInferenceStatus(
      this.labSessionId,
      INFERENCE_STATUS.IDLE
    );
    publishInferenceStatus(
      this.getPublisher(),
      this.labSessionId,
      INFERENCE_STATUS.IDLE
    );
    this.completionTimerManager.scheduleCompletion(this.labSessionId);
  }
}

export class SandboxAgentMonitor {
  private readonly trackers = new Map<string, SessionTracker>();
  private readonly abortController = new AbortController();
  private readonly completionTimerManager = new CompletionTimerManager(() =>
    this.deferredPublisher.get()
  );

  private readonly sandboxAgentResolver: SandboxAgentClientResolver;
  private readonly deferredPublisher: DeferredPublisher;
  private readonly sessionStateStore: SessionStateStore;

  constructor(
    sandboxAgentResolver: SandboxAgentClientResolver,
    deferredPublisher: DeferredPublisher,
    sessionStateStore: SessionStateStore
  ) {
    this.sandboxAgentResolver = sandboxAgentResolver;
    this.deferredPublisher = deferredPublisher;
    this.sessionStateStore = sessionStateStore;
  }

  async start(): Promise<void> {
    await widelog.context(async () => {
      widelog.set("event_name", "sandbox_agent_monitor.start");
      widelog.time.start("duration_ms");

      try {
        await this.syncSessions();
        widelog.set("outcome", "success");
      } catch (error) {
        widelog.set("outcome", "error");
        widelog.errorFields(error);
      } finally {
        widelog.time.stop("duration_ms");
        widelog.flush();
      }
    });

    this.runSyncLoop();
  }

  stop(): void {
    this.abortController.abort();

    for (const tracker of this.trackers.values()) {
      tracker.stop();
    }
    this.trackers.clear();
  }

  private async runSyncLoop(): Promise<void> {
    while (!this.abortController.signal.aborted) {
      await new Promise((resolve) =>
        setTimeout(resolve, TIMING.SANDBOX_AGENT_SYNC_INTERVAL_MS)
      );
      if (this.abortController.signal.aborted) {
        return;
      }

      try {
        await this.syncSessions();
      } catch (error) {
        widelog.context(() => {
          widelog.set("event_name", "sandbox_agent_monitor.sync_failed");
          widelog.set("active_trackers", this.trackers.size);
          widelog.set(
            "sync_interval_ms",
            TIMING.SANDBOX_AGENT_SYNC_INTERVAL_MS
          );
          widelog.set("outcome", "error");
          widelog.errorFields(error);
          widelog.flush();
        });
      }
    }
  }

  private async syncSessions(): Promise<void> {
    const active = await findRunningSessions();
    const activeIds = new Set(active.map((session) => session.id));

    for (const [id, tracker] of this.trackers) {
      if (!activeIds.has(id)) {
        tracker.stop();
        this.trackers.delete(id);
      }
    }

    for (const { id } of active) {
      if (!this.trackers.has(id)) {
        this.trackers.set(
          id,
          new SessionTracker(
            id,
            this.sandboxAgentResolver,
            () => this.deferredPublisher.get(),
            this.completionTimerManager,
            this.sessionStateStore
          )
        );
      }
    }
  }
}
