import { db } from "@lab/database/client";
import { sessions, type Session } from "@lab/database/schema/sessions";
import { eq } from "drizzle-orm";

export async function findSessionById(sessionId: string): Promise<Session | null> {
  const [session] = await db.select().from(sessions).where(eq(sessions.id, sessionId));
  return session ?? null;
}

export async function findSessionsByProjectId(projectId: string): Promise<Session[]> {
  return db.select().from(sessions).where(eq(sessions.projectId, projectId));
}

export async function createSession(projectId: string, title?: string): Promise<Session> {
  const [session] = await db.insert(sessions).values({ projectId, title }).returning();
  return session;
}

export async function updateSessionOpencodeId(
  sessionId: string,
  opencodeSessionId: string,
): Promise<Session | null> {
  await db
    .update(sessions)
    .set({ opencodeSessionId: opencodeSessionId, updatedAt: new Date() })
    .where(eq(sessions.id, sessionId));

  return findSessionById(sessionId);
}

export async function updateSessionTitle(
  sessionId: string,
  title: string,
): Promise<Session | null> {
  await db.update(sessions).set({ title, updatedAt: new Date() }).where(eq(sessions.id, sessionId));

  return findSessionById(sessionId);
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

export async function findAllSessionSummaries(): Promise<{ id: string; projectId: string }[]> {
  return db.select({ id: sessions.id, projectId: sessions.projectId }).from(sessions);
}

export async function getSessionOpencodeId(sessionId: string): Promise<string | null> {
  const [session] = await db
    .select({ opencodeSessionId: sessions.opencodeSessionId })
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .limit(1);
  return session?.opencodeSessionId ?? null;
}
