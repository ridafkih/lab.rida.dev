import { db } from "@lab/database/client";
import { sessions } from "@lab/database/schema/sessions";
import { sessionContainers } from "@lab/database/schema/session-containers";
import { containers } from "@lab/database/schema/containers";
import { containerPermissions } from "@lab/database/schema/container-permissions";
import { projects } from "@lab/database/schema/projects";
import { eq } from "drizzle-orm";

import type { RouteHandler } from "../../../utils/route-handler";
import {
  createAgentSession,
  getAgentSession,
  hasAgentSession,
  destroyAgentSession,
} from "../../../agent";

const GET: RouteHandler = async (_request, params) => {
  const { sessionId } = params;

  const session = getAgentSession(sessionId);
  if (!session) {
    return Response.json({ active: false });
  }

  return Response.json({
    active: true,
    isProcessing: session.isActive,
    messages: await session.getMessages(),
  });
};

const POST: RouteHandler = async (_request, params) => {
  const { sessionId } = params;

  if (hasAgentSession(sessionId)) {
    return Response.json({ error: "Agent already started for this session" }, { status: 409 });
  }

  const [session] = await db.select().from(sessions).where(eq(sessions.id, sessionId));
  if (!session) {
    return Response.json({ error: "Session not found" }, { status: 404 });
  }

  const [project] = await db.select().from(projects).where(eq(projects.id, session.projectId));
  if (!project) {
    return Response.json({ error: "Project not found" }, { status: 404 });
  }

  const sessionContainerRows = await db
    .select()
    .from(sessionContainers)
    .where(eq(sessionContainers.sessionId, sessionId));

  const agentContainers = await Promise.all(
    sessionContainerRows.map(async (sessionController) => {
      const [container] = await db
        .select()
        .from(containers)
        .where(eq(containers.id, sessionController.containerId));

      const [perms] = await db
        .select()
        .from(containerPermissions)
        .where(eq(containerPermissions.containerId, sessionController.containerId));

      return {
        id: sessionController.id,
        containerId: sessionController.containerId,
        dockerId: sessionController.dockerId,
        hostname: container?.hostname ?? undefined,
        permissions: perms?.permissions ?? [],
      };
    }),
  );

  createAgentSession({
    sessionId,
    projectId: session.projectId,
    systemPrompt: project.systemPrompt ?? undefined,
    containers: agentContainers,
  });

  return Response.json({ started: true }, { status: 201 });
};

const DELETE: RouteHandler = async (_request, params) => {
  const { sessionId } = params;

  const destroyed = destroyAgentSession(sessionId);

  if (!destroyed) {
    return Response.json({ error: "No agent session found" }, { status: 404 });
  }

  return new Response(null, { status: 204 });
};

export { DELETE, GET, POST };
