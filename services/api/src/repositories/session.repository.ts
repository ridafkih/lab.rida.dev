import { db } from "@lab/database/client";
import { sessions, type Session } from "@lab/database/schema/sessions";
import { projects } from "@lab/database/schema/projects";
import { eq, ne, and, isNull, inArray, desc, or, ilike } from "drizzle-orm";
import { SESSION_STATUS } from "../types/session";
import { InternalError, orThrow } from "../shared/errors";

const visibleSessionConditions = [
  ne(sessions.status, SESSION_STATUS.DELETING),
  ne(sessions.status, SESSION_STATUS.POOLED),
];

export async function findSessionById(sessionId: string): Promise<Session | null> {
  const [session] = await db.select().from(sessions).where(eq(sessions.id, sessionId));
  return session ?? null;
}

export async function findSessionByIdOrThrow(sessionId: string): Promise<Session> {
  return orThrow(await findSessionById(sessionId), "Session", sessionId);
}

export async function findSessionsByProjectId(projectId: string): Promise<Session[]> {
  return db
    .select()
    .from(sessions)
    .where(and(eq(sessions.projectId, projectId), ...visibleSessionConditions));
}

export async function createSession(projectId: string, title?: string): Promise<Session> {
  const [session] = await db.insert(sessions).values({ projectId, title }).returning();
  if (!session) throw new InternalError("Failed to create session", "SESSION_CREATE_FAILED");
  return session;
}

export async function updateSessionFields(
  sessionId: string,
  fields: { opencodeSessionId?: string; workspaceDirectory?: string; title?: string },
): Promise<Session | null> {
  return db.transaction(async (tx) => {
    if (fields.opencodeSessionId) {
      await tx
        .update(sessions)
        .set({
          opencodeSessionId: fields.opencodeSessionId,
          ...(fields.workspaceDirectory && { workspaceDirectory: fields.workspaceDirectory }),
          updatedAt: new Date(),
        })
        .where(and(eq(sessions.id, sessionId), isNull(sessions.opencodeSessionId)));

      if (fields.workspaceDirectory) {
        await tx
          .update(sessions)
          .set({ workspaceDirectory: fields.workspaceDirectory, updatedAt: new Date() })
          .where(and(eq(sessions.id, sessionId), isNull(sessions.workspaceDirectory)));
      }
    }

    if (fields.title !== undefined) {
      await tx
        .update(sessions)
        .set({ title: fields.title, updatedAt: new Date() })
        .where(eq(sessions.id, sessionId));
    }

    const [session] = await tx.select().from(sessions).where(eq(sessions.id, sessionId));
    return session ?? null;
  });
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
    .where(and(...visibleSessionConditions));
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
  return db
    .select({ id: sessions.id })
    .from(sessions)
    .where(eq(sessions.status, SESSION_STATUS.RUNNING));
}

export async function findActiveSessionsForReconciliation(): Promise<{ id: string }[]> {
  return db
    .select({ id: sessions.id })
    .from(sessions)
    .where(inArray(sessions.status, [SESSION_STATUS.RUNNING, SESSION_STATUS.POOLED]));
}

export async function findSessionsWithProject({
  projectId,
  limit,
}: {
  projectId?: string;
  limit?: number;
}) {
  const conditions = [...visibleSessionConditions];
  if (projectId) {
    conditions.push(eq(sessions.projectId, projectId));
  }

  return db
    .select({
      id: sessions.id,
      projectId: sessions.projectId,
      projectName: projects.name,
      title: sessions.title,
      status: sessions.status,
      createdAt: sessions.createdAt,
    })
    .from(sessions)
    .innerJoin(projects, eq(sessions.projectId, projects.id))
    .where(and(...conditions))
    .orderBy(desc(sessions.createdAt))
    .limit(limit ?? 10);
}

export async function searchSessionsWithProject({
  query,
  limit,
}: {
  query: string;
  limit?: number;
}) {
  const searchLimit = limit ?? 5;

  return db
    .select({
      id: sessions.id,
      projectId: sessions.projectId,
      projectName: projects.name,
      title: sessions.title,
      opencodeSessionId: sessions.opencodeSessionId,
      status: sessions.status,
      createdAt: sessions.createdAt,
    })
    .from(sessions)
    .innerJoin(projects, eq(sessions.projectId, projects.id))
    .where(
      and(
        ...visibleSessionConditions,
        or(ilike(sessions.title, `%${query}%`), ilike(projects.name, `%${query}%`)),
      ),
    )
    .orderBy(desc(sessions.createdAt))
    .limit(searchLimit * 2);
}
