import { db } from "@lab/database/client";
import {
  browserSessions,
  type ActualState,
  type DesiredState,
} from "@lab/database/schema/browser-sessions";
import { eq } from "drizzle-orm";

export interface BrowserSessionState {
  sessionId: string;
  desiredState: DesiredState;
  actualState: ActualState;
  streamPort: number | null;
  lastHeartbeat: Date | null;
  errorMessage: string | null;
  retryCount: number;
}

export class BrowserStateManager {
  async getState(sessionId: string): Promise<BrowserSessionState | null> {
    const [session] = await db
      .select()
      .from(browserSessions)
      .where(eq(browserSessions.sessionId, sessionId))
      .limit(1);

    if (!session) return null;

    return {
      sessionId: session.sessionId,
      desiredState: session.desiredState as DesiredState,
      actualState: session.actualState as ActualState,
      streamPort: session.streamPort,
      lastHeartbeat: session.lastHeartbeat,
      errorMessage: session.errorMessage,
      retryCount: session.retryCount,
    };
  }

  async setDesiredState(
    sessionId: string,
    desiredState: DesiredState,
  ): Promise<BrowserSessionState> {
    const [session] = await db
      .insert(browserSessions)
      .values({
        sessionId,
        desiredState,
        actualState: "stopped",
      })
      .onConflictDoUpdate({
        target: browserSessions.sessionId,
        set: {
          desiredState,
          updatedAt: new Date(),
        },
      })
      .returning();

    return {
      sessionId: session.sessionId,
      desiredState: session.desiredState as DesiredState,
      actualState: session.actualState as ActualState,
      streamPort: session.streamPort,
      lastHeartbeat: session.lastHeartbeat,
      errorMessage: session.errorMessage,
      retryCount: session.retryCount,
    };
  }

  async setActualState(
    sessionId: string,
    actualState: ActualState,
    options: {
      streamPort?: number | null;
      errorMessage?: string | null;
      retryCount?: number;
    } = {},
  ): Promise<BrowserSessionState | null> {
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

    const [session] = await db
      .update(browserSessions)
      .set(updateData)
      .where(eq(browserSessions.sessionId, sessionId))
      .returning();

    if (!session) return null;

    return {
      sessionId: session.sessionId,
      desiredState: session.desiredState as DesiredState,
      actualState: session.actualState as ActualState,
      streamPort: session.streamPort,
      lastHeartbeat: session.lastHeartbeat,
      errorMessage: session.errorMessage,
      retryCount: session.retryCount,
    };
  }

  async updateHeartbeat(sessionId: string): Promise<void> {
    await db
      .update(browserSessions)
      .set({
        lastHeartbeat: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(browserSessions.sessionId, sessionId));
  }

  async getAllSessions(): Promise<BrowserSessionState[]> {
    const sessions = await db.select().from(browserSessions);

    return sessions.map((session) => ({
      sessionId: session.sessionId,
      desiredState: session.desiredState as DesiredState,
      actualState: session.actualState as ActualState,
      streamPort: session.streamPort,
      lastHeartbeat: session.lastHeartbeat,
      errorMessage: session.errorMessage,
      retryCount: session.retryCount,
    }));
  }

  async getSessionsNeedingReconciliation(): Promise<BrowserSessionState[]> {
    const sessions = await db.select().from(browserSessions);

    return sessions
      .filter((session) => {
        if (session.desiredState === "running") {
          return session.actualState === "stopped" || session.actualState === "error";
        }
        if (session.desiredState === "stopped") {
          return session.actualState === "running" || session.actualState === "starting";
        }
        return false;
      })
      .map((session) => ({
        sessionId: session.sessionId,
        desiredState: session.desiredState as DesiredState,
        actualState: session.actualState as ActualState,
        streamPort: session.streamPort,
        lastHeartbeat: session.lastHeartbeat,
        errorMessage: session.errorMessage,
        retryCount: session.retryCount,
      }));
  }

  async subscribe(sessionId: string): Promise<BrowserSessionState> {
    return this.setDesiredState(sessionId, "running");
  }

  async unsubscribe(sessionId: string): Promise<BrowserSessionState | null> {
    const state = await this.getState(sessionId);
    if (!state) return null;

    return this.setDesiredState(sessionId, "stopped");
  }

  async delete(sessionId: string): Promise<void> {
    await db.delete(browserSessions).where(eq(browserSessions.sessionId, sessionId));
  }
}

export const browserStateManager = new BrowserStateManager();
