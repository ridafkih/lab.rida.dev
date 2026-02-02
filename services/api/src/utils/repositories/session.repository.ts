import { db } from "@lab/database/client";
import { sessions, type Session } from "@lab/database/schema/sessions";
import { eq, ne, and, count, isNull, inArray } from "drizzle-orm";

export async function findSessionById(sessionId: string): Promise<Session | null> {
  const [session] = await db.select().from(sessions).where(eq(sessions.id, sessionId));
  return session ?? null;
}

export async function findSessionsByProjectId(projectId: string): Promise<Session[]> {
  return db
    .select()
    .from(sessions)
    .where(
      and(
        eq(sessions.projectId, projectId),
        ne(sessions.status, "deleting"),
        ne(sessions.status, "pooled"),
      ),
    );
}

export async function createSession(projectId: string, title?: string): Promise<Session> {
  const [session] = await db.insert(sessions).values({ projectId, title }).returning();
  if (!session) throw new Error("Failed to create session");
  return session;
}

async function setOpencodeSessionIdIfUnset(
  sessionId: string,
  opencodeSessionId: string,
  workspaceDirectory?: string,
): Promise<void> {
  await db
    .update(sessions)
    .set({
      opencodeSessionId: opencodeSessionId,
      ...(workspaceDirectory && { workspaceDirectory }),
      updatedAt: new Date(),
    })
    .where(and(eq(sessions.id, sessionId), isNull(sessions.opencodeSessionId)));
}

async function setWorkspaceDirectoryIfUnset(
  sessionId: string,
  workspaceDirectory: string,
): Promise<void> {
  await db
    .update(sessions)
    .set({
      workspaceDirectory,
      updatedAt: new Date(),
    })
    .where(and(eq(sessions.id, sessionId), isNull(sessions.workspaceDirectory)));
}

export async function updateSessionOpencodeId(
  sessionId: string,
  opencodeSessionId: string,
  workspaceDirectory?: string,
): Promise<Session | null> {
  await setOpencodeSessionIdIfUnset(sessionId, opencodeSessionId, workspaceDirectory);

  if (workspaceDirectory) {
    await setWorkspaceDirectoryIfUnset(sessionId, workspaceDirectory);
  }

  return findSessionById(sessionId);
}

export async function getSessionWorkspaceDirectory(sessionId: string): Promise<string | null> {
  const [session] = await db
    .select({ workspaceDirectory: sessions.workspaceDirectory })
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .limit(1);
  return session?.workspaceDirectory ?? null;
}

export async function updateSessionTitle(
  sessionId: string,
  title?: string,
): Promise<Session | null> {
  await db.update(sessions).set({ title, updatedAt: new Date() }).where(eq(sessions.id, sessionId));

  return findSessionById(sessionId);
}

export async function markSessionDeleting(sessionId: string): Promise<void> {
  await db
    .update(sessions)
    .set({ status: "deleting", updatedAt: new Date() })
    .where(eq(sessions.id, sessionId));
}

export async function updateSessionStatus(sessionId: string, status: string): Promise<void> {
  await db
    .update(sessions)
    .set({ status, updatedAt: new Date() })
    .where(eq(sessions.id, sessionId));
}

export async function deleteSession(sessionId: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.id, sessionId));
}

export async function getAllSessionsWithOpencodeId(): Promise<
  { id: string; opencodeSessionId: string | null }[]
> {
  return db
    .select({ id: sessions.id, opencodeSessionId: sessions.opencodeSessionId })
    .from(sessions);
}

export async function findAllSessionSummaries(): Promise<
  { id: string; projectId: string; title: string | null }[]
> {
  return db
    .select({ id: sessions.id, projectId: sessions.projectId, title: sessions.title })
    .from(sessions)
    .where(and(ne(sessions.status, "deleting"), ne(sessions.status, "pooled")));
}

export async function getSessionOpencodeId(sessionId: string): Promise<string | null> {
  const [session] = await db
    .select({ opencodeSessionId: sessions.opencodeSessionId })
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .limit(1);
  return session?.opencodeSessionId ?? null;
}

export async function findRunningSessions(): Promise<{ id: string }[]> {
  return db.select({ id: sessions.id }).from(sessions).where(eq(sessions.status, "running"));
}

export async function findActiveSessionsForReconciliation(): Promise<{ id: string }[]> {
  return db
    .select({ id: sessions.id })
    .from(sessions)
    .where(inArray(sessions.status, ["running", "pooled"]));
}

export async function claimPooledSession(projectId: string): Promise<Session | null> {
  return db.transaction(async (tx) => {
    const [candidate] = await tx
      .select({ id: sessions.id })
      .from(sessions)
      .where(and(eq(sessions.projectId, projectId), eq(sessions.status, "pooled")))
      .limit(1)
      .for("update", { skipLocked: true });

    if (!candidate) {
      return null;
    }

    const [session] = await tx
      .update(sessions)
      .set({ status: "running", updatedAt: new Date() })
      .where(eq(sessions.id, candidate.id))
      .returning();

    return session ?? null;
  });
}

export async function countPooledSessions(projectId: string): Promise<number> {
  const [result] = await db
    .select({ count: count() })
    .from(sessions)
    .where(and(eq(sessions.projectId, projectId), eq(sessions.status, "pooled")));
  return result?.count ?? 0;
}

export async function findPooledSessions(projectId: string, limit?: number): Promise<Session[]> {
  const query = db
    .select()
    .from(sessions)
    .where(and(eq(sessions.projectId, projectId), eq(sessions.status, "pooled")));

  if (limit !== undefined) {
    return query.limit(limit);
  }

  return query;
}

export async function createPooledSession(projectId: string): Promise<Session> {
  const [session] = await db.insert(sessions).values({ projectId, status: "pooled" }).returning();
  if (!session) throw new Error("Failed to create pooled session");
  return session;
}
