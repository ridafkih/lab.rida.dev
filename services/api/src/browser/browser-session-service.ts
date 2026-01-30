import { publisher } from "../publisher";
import { browserStateManager, type BrowserSessionState } from "./state-manager";
import { BrowserClient } from "./client";

export type DesiredState = "running" | "stopped";
export type ActualState = "pending" | "starting" | "running" | "stopping" | "stopped" | "error";

export interface BrowserSessionSnapshot {
  sessionId: string;
  desiredState: DesiredState;
  actualState: ActualState;
  streamPort: number | null;
  errorMessage: string | null;
  subscriberCount: number;
}

export interface SubscribeOptions {
  subscriberCount: number;
}

interface SessionState {
  subscriberCount: number;
  cleanupTimer: ReturnType<typeof setTimeout> | null;
  lastFrame: string | null;
  lastFrameTime: number | null;
}

const BROWSER_API_URL = process.env.BROWSER_API_URL;
if (!BROWSER_API_URL) {
  throw new Error("BROWSER_API_URL must be defined");
}

const CLEANUP_DELAY_MS = parseInt(process.env.BROWSER_CLEANUP_DELAY_MS ?? "10000", 10);
const RECONCILE_INTERVAL_MS = parseInt(process.env.RECONCILE_INTERVAL_MS ?? "5000", 10);
const MAX_RETRIES = parseInt(process.env.MAX_DAEMON_RETRIES ?? "3", 10);

class BrowserSessionService {
  private readonly sessions = new Map<string, SessionState>();
  private readonly client: BrowserClient;
  private reconcilerInterval: ReturnType<typeof setInterval> | null = null;
  private reconcilerRunning = false;

  constructor(client: BrowserClient) {
    this.client = client;
  }

  async getSnapshot(sessionId: string): Promise<BrowserSessionSnapshot> {
    const dbState = await browserStateManager.getState(sessionId);
    const localState = this.sessions.get(sessionId);

    if (!dbState) {
      return {
        sessionId,
        desiredState: "stopped",
        actualState: "stopped",
        streamPort: null,
        errorMessage: null,
        subscriberCount: localState?.subscriberCount ?? 0,
      };
    }

    return {
      sessionId: dbState.sessionId,
      desiredState: dbState.desiredState,
      actualState: dbState.actualState,
      streamPort: dbState.streamPort,
      errorMessage: dbState.errorMessage,
      subscriberCount: localState?.subscriberCount ?? 0,
    };
  }

  async subscribe(sessionId: string, options: SubscribeOptions): Promise<BrowserSessionSnapshot> {
    let state = this.sessions.get(sessionId);

    if (!state) {
      state = {
        subscriberCount: 0,
        cleanupTimer: null,
        lastFrame: null,
        lastFrameTime: null,
      };
      this.sessions.set(sessionId, state);
    }

    if (state.cleanupTimer) {
      clearTimeout(state.cleanupTimer);
      state.cleanupTimer = null;
    }

    const wasEmpty = state.subscriberCount === 0;
    state.subscriberCount = options.subscriberCount;
    console.log(
      `[BrowserSession] Subscribe ${sessionId}: wasEmpty=${wasEmpty}, newCount=${state.subscriberCount}, mapSize=${this.sessions.size}`,
    );

    if (wasEmpty && state.subscriberCount > 0) {
      try {
        await browserStateManager.subscribe(sessionId);
      } catch (err) {
        console.warn(`Failed to subscribe to browser session ${sessionId}:`, err);
      }
    }

    return this.getSnapshot(sessionId);
  }

  async unsubscribe(sessionId: string, options: SubscribeOptions): Promise<BrowserSessionSnapshot> {
    let state = this.sessions.get(sessionId);
    const existed = !!state;

    if (!state) {
      state = {
        subscriberCount: 0,
        cleanupTimer: null,
        lastFrame: null,
        lastFrameTime: null,
      };
      this.sessions.set(sessionId, state);
    }

    state.subscriberCount = options.subscriberCount;
    console.log(
      `[BrowserSession] Unsubscribe ${sessionId}: existed=${existed}, newCount=${state.subscriberCount}, mapSize=${this.sessions.size}`,
    );

    if (state.subscriberCount === 0) {
      if (state.cleanupTimer) {
        clearTimeout(state.cleanupTimer);
      }
      console.log(
        `[BrowserSession] Starting cleanup timer for ${sessionId} (${CLEANUP_DELAY_MS}ms)`,
      );
      const stateRef = state; // Capture reference
      state.cleanupTimer = setTimeout(async () => {
        console.log(
          `[BrowserSession] Cleanup timer fired for ${sessionId}, count=${stateRef.subscriberCount}`,
        );
        if (stateRef.subscriberCount === 0) {
          stateRef.cleanupTimer = null;
          stateRef.lastFrame = null;
          stateRef.lastFrameTime = null;

          console.log(`[BrowserSession] Calling browserStateManager.unsubscribe for ${sessionId}`);
          try {
            await browserStateManager.unsubscribe(sessionId);
            console.log(`[BrowserSession] Successfully unsubscribed ${sessionId}`);
          } catch (err) {
            console.warn(`Failed to unsubscribe from browser session ${sessionId}:`, err);
          }
        } else {
          console.log(`[BrowserSession] Cleanup cancelled, count=${stateRef.subscriberCount}`);
        }
      }, CLEANUP_DELAY_MS);
    }

    return this.getSnapshot(sessionId);
  }

  async forceStop(sessionId: string): Promise<void> {
    const state = this.sessions.get(sessionId);

    if (state) {
      if (state.cleanupTimer) {
        clearTimeout(state.cleanupTimer);
      }
      this.sessions.delete(sessionId);
    }

    try {
      await this.client.stopDaemon(sessionId);
    } catch (err) {
      console.warn(`Failed to stop daemon for session ${sessionId}:`, err);
    }

    try {
      await browserStateManager.delete(sessionId);
    } catch (err) {
      console.warn(`Failed to delete browser session ${sessionId}:`, err);
    }
  }

  getCachedFrame(sessionId: string): string | null {
    return this.sessions.get(sessionId)?.lastFrame ?? null;
  }

  async launchBrowser(sessionId: string): Promise<boolean> {
    return this.client.launchBrowser(sessionId);
  }

  setCachedFrame(sessionId: string, frame: string): void {
    let state = this.sessions.get(sessionId);
    if (!state) {
      state = {
        subscriberCount: 0,
        cleanupTimer: null,
        lastFrame: null,
        lastFrameTime: null,
      };
      this.sessions.set(sessionId, state);
    }
    state.lastFrame = frame;
    state.lastFrameTime = Date.now();
  }

  startReconciler(): void {
    if (this.reconcilerRunning) return;
    this.reconcilerRunning = true;

    console.log(`Starting browser session reconciler (interval: ${RECONCILE_INTERVAL_MS}ms)`);

    this.reconcile().catch((err) => {
      console.error("Initial reconciliation error:", err);
    });

    this.reconcilerInterval = setInterval(async () => {
      try {
        await this.reconcile();
      } catch (err) {
        console.error("Reconciliation error:", err);
      }
    }, RECONCILE_INTERVAL_MS);
  }

  stopReconciler(): void {
    if (!this.reconcilerRunning) return;
    this.reconcilerRunning = false;

    if (this.reconcilerInterval) {
      clearInterval(this.reconcilerInterval);
      this.reconcilerInterval = null;
    }

    console.log("Stopped browser session reconciler");
  }

  private async reconcile(): Promise<void> {
    const sessions = await browserStateManager.getAllSessions();

    for (const session of sessions) {
      try {
        await this.reconcileSession(session);
      } catch (err) {
        console.error(`Failed to reconcile session ${session.sessionId}:`, err);
      }
    }
  }

  private async reconcileSession(session: BrowserSessionState): Promise<void> {
    const { sessionId, desiredState, actualState, streamPort, retryCount } = session;

    if (desiredState === "running") {
      await this.reconcileRunningDesired(sessionId, actualState, retryCount, streamPort);
    } else if (desiredState === "stopped") {
      await this.reconcileStoppedDesired(sessionId, actualState);
    }
  }

  private async reconcileRunningDesired(
    sessionId: string,
    actualState: ActualState,
    retryCount: number,
    existingPort: number | null,
  ): Promise<void> {
    switch (actualState) {
      case "stopped":
      case "error":
        if (retryCount >= MAX_RETRIES) {
          console.warn(
            `Session ${sessionId} exceeded max retries (${MAX_RETRIES}), staying in error state`,
          );
          return;
        }
        await this.startSession(sessionId, retryCount, existingPort);
        break;

      case "pending":
        break;

      case "starting": {
        const status = await this.client.getDaemonStatus(sessionId);
        if (status.ready) {
          await this.updateActualState(sessionId, "running", {
            streamPort: status.port,
          });

          const lastUrl = await browserStateManager.getLastUrl(sessionId);
          if (lastUrl && lastUrl !== "about:blank") {
            console.log(`Restoring last URL for session ${sessionId}: ${lastUrl}`);
            await this.client.navigateTo(sessionId, lastUrl);
          }
        }
        break;
      }

      case "running": {
        const status = await this.client.getDaemonStatus(sessionId);
        if (!status.running) {
          console.warn(`Session ${sessionId} daemon not running, restarting`);
          await this.updateActualState(sessionId, "stopped");
        }
        break;
      }

      case "stopping": {
        const status = await this.client.getDaemonStatus(sessionId);
        if (!status.running) {
          console.log(
            `Session ${sessionId} stuck in stopping but daemon dead, resetting to stopped`,
          );
          await this.updateActualState(sessionId, "stopped");
        }
        break;
      }
    }
  }

  private async reconcileStoppedDesired(
    sessionId: string,
    actualState: ActualState,
  ): Promise<void> {
    switch (actualState) {
      case "running":
      case "starting":
        await this.stopSession(sessionId);
        break;

      case "pending":
      case "stopping":
      case "stopped":
      case "error":
        if (actualState !== "stopped") {
          await this.updateActualState(sessionId, "stopped");
        }
        break;
    }
  }

  private async startSession(
    sessionId: string,
    currentRetryCount: number,
    existingPort: number | null,
  ): Promise<void> {
    console.log(`Starting daemon for session ${sessionId}`);

    await this.updateActualState(sessionId, "starting", {
      retryCount: currentRetryCount + 1,
      errorMessage: null,
    });

    try {
      const result = await this.client.startDaemon(sessionId, {
        streamPort: existingPort ?? undefined,
      });

      await this.updateActualState(sessionId, "starting", {
        streamPort: result.port,
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      console.error(`Failed to start daemon for session ${sessionId}:`, errorMessage);

      await this.updateActualState(sessionId, "error", {
        errorMessage,
      });
    }
  }

  private async stopSession(sessionId: string): Promise<void> {
    console.log(`Stopping daemon for session ${sessionId}`);

    try {
      const currentUrl = await this.client.getCurrentUrl(sessionId);
      if (currentUrl && currentUrl !== "about:blank") {
        await browserStateManager.setLastUrl(sessionId, currentUrl);
        console.log(`Saved last URL for session ${sessionId}: ${currentUrl}`);
      }
    } catch (err) {
      console.warn(`Failed to save last URL for session ${sessionId}:`, err);
    }

    await this.updateActualState(sessionId, "stopping");

    try {
      await this.client.stopDaemon(sessionId);
      await this.updateActualState(sessionId, "stopped", {
        streamPort: null,
        errorMessage: null,
        retryCount: 0,
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      console.error(`Failed to stop daemon for session ${sessionId}:`, errorMessage);

      await this.updateActualState(sessionId, "error", {
        errorMessage,
      });
    }
  }

  private async updateActualState(
    sessionId: string,
    actualState: ActualState,
    options: {
      streamPort?: number | null;
      errorMessage?: string | null;
      retryCount?: number;
    } = {},
  ): Promise<void> {
    const state = await browserStateManager.setActualState(sessionId, actualState, options);

    if (state) {
      publisher.publishSnapshot(
        "sessionBrowserStream",
        { uuid: sessionId },
        {
          desiredState: state.desiredState,
          actualState: state.actualState,
          streamPort: state.streamPort ?? undefined,
          errorMessage: state.errorMessage ?? undefined,
        },
      );
    }
  }
}

const browserClient = new BrowserClient(BROWSER_API_URL);
export const browserSessionService = new BrowserSessionService(browserClient);
