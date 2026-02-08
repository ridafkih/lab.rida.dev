import { db } from "@lab/database/client";
import { sessions, type Session } from "@lab/database/schema/sessions";
import { eq, and, count } from "drizzle-orm";
import { SESSION_STATUS } from "../types/session";
import { InternalError } from "../shared/errors";

export async function claimPooledSession(projectId: string): Promise<Session | null> {
  return db.transaction(async (tx) => {
    const [candidate] = await tx
      .select({ id: sessions.id })
      .from(sessions)
      .where(and(eq(sessions.projectId, projectId), eq(sessions.status, SESSION_STATUS.POOLED)))
      .limit(1)
      .for("update", { skipLocked: true });

    if (!candidate) {
      return null;
    }

    const [session] = await tx
      .update(sessions)
      .set({ status: SESSION_STATUS.RUNNING, updatedAt: new Date() })
      .where(eq(sessions.id, candidate.id))
      .returning();

    return session ?? null;
  });
}

export async function countPooledSessions(projectId: string): Promise<number> {
  const [result] = await db
    .select({ count: count() })
    .from(sessions)
    .where(and(eq(sessions.projectId, projectId), eq(sessions.status, SESSION_STATUS.POOLED)));
  return result?.count ?? 0;
}

export async function findPooledSessions(projectId: string, limit?: number): Promise<Session[]> {
  const query = db
    .select()
    .from(sessions)
    .where(and(eq(sessions.projectId, projectId), eq(sessions.status, SESSION_STATUS.POOLED)));

  if (limit !== undefined) {
    return query.limit(limit);
  }

  return query;
}

export async function createPooledSession(projectId: string): Promise<Session> {
  const [session] = await db
    .insert(sessions)
    .values({ projectId, status: SESSION_STATUS.POOLED })
    .returning();
  if (!session) {
    throw new InternalError("Failed to create pooled session", "POOLED_SESSION_CREATE_FAILED");
  }
  return session;
}
