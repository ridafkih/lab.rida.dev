import { db } from "@lab/database/client";
import { browserSessions } from "@lab/database/schema/browser-sessions";
import { eq } from "drizzle-orm";
import { isDaemonRunning as checkDaemonRunning } from "./daemon-manager";

const HEARTBEAT_TIMEOUT_MS = parseInt(
  process.env.HEARTBEAT_TIMEOUT_MS ?? "30000",
  10,
);

export interface HealthStatus {
  sessionId: string;
  daemonRunning: boolean;
  heartbeatFresh: boolean;
  lastHeartbeat: Date | null;
}

export class HealthMonitor {
  isDaemonRunning(sessionId: string): boolean {
    return checkDaemonRunning(sessionId);
  }

  isHeartbeatFresh(lastHeartbeat: Date | null): boolean {
    if (!lastHeartbeat) return false;
    const now = Date.now();
    const heartbeatTime = lastHeartbeat.getTime();
    return now - heartbeatTime < HEARTBEAT_TIMEOUT_MS;
  }

  async checkHealth(sessionId: string): Promise<HealthStatus> {
    const [session] = await db
      .select()
      .from(browserSessions)
      .where(eq(browserSessions.sessionId, sessionId))
      .limit(1);

    const lastHeartbeat = session?.lastHeartbeat ?? null;

    return {
      sessionId,
      daemonRunning: this.isDaemonRunning(sessionId),
      heartbeatFresh: this.isHeartbeatFresh(lastHeartbeat),
      lastHeartbeat,
    };
  }

  async checkAllSessions(): Promise<HealthStatus[]> {
    const sessions = await db.select().from(browserSessions);

    return sessions.map((session) => ({
      sessionId: session.sessionId,
      daemonRunning: this.isDaemonRunning(session.sessionId),
      heartbeatFresh: this.isHeartbeatFresh(session.lastHeartbeat),
      lastHeartbeat: session.lastHeartbeat,
    }));
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
}

export const healthMonitor = new HealthMonitor();
