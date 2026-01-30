import { db } from "@lab/database/client";
import { sessions } from "@lab/database/schema/sessions";
import { sessionContainers } from "@lab/database/schema/session-containers";
import { eq } from "drizzle-orm";
import { DockerClient } from "@lab/sandbox-docker";
import { proxyManager, isProxyInitialized } from "../../proxy";
import { publisher } from "../../publisher";
import { browserStateManager } from "../../browser";

import type { RouteHandler } from "../../utils/route-handler";

const docker = new DockerClient();

const GET: RouteHandler = async (_request, params) => {
  const { sessionId } = params;

  const [session] = await db.select().from(sessions).where(eq(sessions.id, sessionId));

  if (!session) {
    return new Response("Not found", { status: 404 });
  }

  const containers = await db
    .select()
    .from(sessionContainers)
    .where(eq(sessionContainers.sessionId, sessionId));

  const containersWithStatus = await Promise.all(
    containers.map(async (container) => {
      if (!container.dockerId) {
        return { ...container, info: null };
      }
      const info = await docker.inspectContainer(container.dockerId);
      return { ...container, info };
    }),
  );

  return Response.json({
    ...session,
    containers: containersWithStatus,
  });
};

const PATCH: RouteHandler = async (request, params) => {
  const { sessionId } = params;

  const [session] = await db.select().from(sessions).where(eq(sessions.id, sessionId));

  if (!session) {
    return new Response("Not found", { status: 404 });
  }

  const body = await request.json();

  if (typeof body.opencodeSessionId === "string") {
    await db
      .update(sessions)
      .set({ opencodeSessionId: body.opencodeSessionId, updatedAt: new Date() })
      .where(eq(sessions.id, sessionId));
  }

  const [updated] = await db.select().from(sessions).where(eq(sessions.id, sessionId));

  return Response.json(updated);
};

const DELETE: RouteHandler = async (_request, params) => {
  const { sessionId } = params;

  const [session] = await db.select().from(sessions).where(eq(sessions.id, sessionId));

  if (!session) {
    return new Response("Not found", { status: 404 });
  }

  const containers = await db
    .select()
    .from(sessionContainers)
    .where(eq(sessionContainers.sessionId, sessionId));

  await Promise.all(
    containers
      .filter((container) => container.dockerId)
      .map(async (container) => {
        await docker.stopContainer(container.dockerId);
        await docker.removeContainer(container.dockerId);
      }),
  );

  const networkName = `lab-${sessionId}`;

  await browserStateManager.unsubscribe(sessionId);

  if (isProxyInitialized()) {
    try {
      await proxyManager.unregisterCluster(sessionId);
    } catch {
      try {
        const caddyContainerName = process.env.CADDY_CONTAINER_NAME;
        if (caddyContainerName) {
          await docker.disconnectFromNetwork(caddyContainerName, networkName);
        }
      } catch {}
    }
  }

  await docker.removeNetwork(networkName);

  await db.delete(sessions).where(eq(sessions.id, sessionId));

  publisher.publishDelta("sessions", {
    type: "remove",
    session: {
      id: session.id,
      projectId: session.projectId,
      title: session.id.slice(0, 8),
    },
  });

  return new Response(null, { status: 204 });
};

export { DELETE, GET, PATCH };
