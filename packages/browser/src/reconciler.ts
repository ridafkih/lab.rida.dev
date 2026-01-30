import { db } from "@lab/database/client";
import {
  browserSessions,
  type ActualState,
} from "@lab/database/schema/browser-sessions";
import { eq } from "drizzle-orm";
import {
  startSessionDaemon,
  stopSessionDaemon,
  isDaemonRunning,
} from "./daemon-manager";

const RECONCILE_INTERVAL_MS = parseInt(
  process.env.RECONCILE_INTERVAL_MS ?? "5000",
  10,
);
const MAX_RETRIES = parseInt(process.env.MAX_DAEMON_RETRIES ?? "3", 10);
const API_INTERNAL_URL = process.env.API_INTERNAL_URL ?? "http://api:3001";

export class BrowserSessionReconciler {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private running = false;

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;

    console.log(
      `Starting browser session reconciler (interval: ${RECONCILE_INTERVAL_MS}ms)`,
    );

    await this.reconcile();

    this.intervalId = setInterval(async () => {
      try {
        await this.reconcile();
      } catch (err) {
        console.error("Reconciliation error:", err);
      }
    }, RECONCILE_INTERVAL_MS);
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    console.log("Stopped browser session reconciler");
  }

  async reconcile(): Promise<void> {
    const sessions = await db.select().from(browserSessions);

    for (const session of sessions) {
      try {
        await this.reconcileSession(session);
      } catch (err) {
        console.error(
          `Failed to reconcile session ${session.sessionId}:`,
          err,
        );
      }
    }
  }

  private async reconcileSession(session: {
    sessionId: string;
    desiredState: string;
    actualState: string;
    streamPort: number | null;
    retryCount: number;
  }): Promise<void> {
    const { sessionId, desiredState, actualState, streamPort, retryCount } = session;

    if (desiredState === "running") {
      await this.reconcileRunningDesired(
        sessionId,
        actualState as ActualState,
        retryCount,
        streamPort,
      );
    } else if (desiredState === "stopped") {
      await this.reconcileStoppedDesired(sessionId, actualState as ActualState);
    }
  }

  private async reconcileRunningDesired(
    sessionId: string,
    actualState: ActualState,
    retryCount: number,
    existingPort?: number | null,
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

      case "starting":
        if (isDaemonRunning(sessionId)) {
          await this.updateState(sessionId, "running");
        }
        break;

      case "running":
        if (!isDaemonRunning(sessionId)) {
          console.warn(`Session ${sessionId} daemon not running, restarting`);
          await this.updateState(sessionId, "stopped");
        }
        break;

      case "stopping":
        // If stopping but desired is running and daemon is dead, reset to stopped
        // so we can restart it on the next reconcile cycle
        if (!isDaemonRunning(sessionId)) {
          console.log(`Session ${sessionId} stuck in stopping but daemon dead, resetting to stopped`);
          await this.updateState(sessionId, "stopped");
        }
        break;
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
          await this.updateState(sessionId, "stopped");
        }
        break;
    }
  }

  private async startSession(
    sessionId: string,
    currentRetryCount: number,
    existingPort?: number | null,
  ): Promise<void> {
    console.log(`Starting daemon for session ${sessionId}`);

    await this.updateState(sessionId, "starting", {
      retryCount: currentRetryCount + 1,
      errorMessage: null,
    });

    try {
      const callbackUrl = `${API_INTERNAL_URL}/internal/browser-ready`;
      const result = await startSessionDaemon(sessionId, {
        callbackUrl,
        streamPort: existingPort ?? undefined,
      });

      await this.updateState(sessionId, "starting", {
        streamPort: result.port,
      });
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Unknown error";
      console.error(`Failed to start daemon for session ${sessionId}:`, errorMessage);

      await this.updateState(sessionId, "error", {
        errorMessage,
      });
    }
  }

  private async stopSession(sessionId: string): Promise<void> {
    console.log(`Stopping daemon for session ${sessionId}`);

    await this.updateState(sessionId, "stopping");

    try {
      stopSessionDaemon(sessionId);
      await this.updateState(sessionId, "stopped", {
        streamPort: null,
        errorMessage: null,
        retryCount: 0,
      });
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Unknown error";
      console.error(`Failed to stop daemon for session ${sessionId}:`, errorMessage);

      await this.updateState(sessionId, "error", {
        errorMessage,
      });
    }
  }

  private async updateState(
    sessionId: string,
    actualState: ActualState,
    options: {
      streamPort?: number | null;
      errorMessage?: string | null;
      retryCount?: number;
    } = {},
  ): Promise<void> {
    const updateData: Record<string, unknown> = {
      actualState,
      updatedAt: new Date(),
    };

    if (options.streamPort !== undefined) {
      updateData.streamPort = options.streamPort;
    }
    if (options.errorMessage !== undefined) {
      updateData.errorMessage = options.errorMessage;
    }
    if (options.retryCount !== undefined) {
      updateData.retryCount = options.retryCount;
    }

    await db
      .update(browserSessions)
      .set(updateData)
      .where(eq(browserSessions.sessionId, sessionId));
  }
}

export const reconciler = new BrowserSessionReconciler();
