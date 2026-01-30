import { db } from "@lab/database/client";
import { containers } from "@lab/database/schema/containers";
import { containerPorts } from "@lab/database/schema/container-ports";
import { eq } from "drizzle-orm";

import type { RouteHandler } from "../../../utils/route-handler";

const GET: RouteHandler = async (_request, params) => {
  const projectContainers = await db
    .select()
    .from(containers)
    .where(eq(containers.projectId, params.projectId));
  return Response.json(projectContainers);
};

const POST: RouteHandler = async (request, params) => {
  const body = await request.json();
  const [container] = await db
    .insert(containers)
    .values({
      projectId: params.projectId,
      image: body.image,
      hostname: body.hostname,
    })
    .returning();

  if (body.ports && Array.isArray(body.ports) && body.ports.length > 0) {
    await db.insert(containerPorts).values(
      body.ports.map((port: number) => ({
        containerId: container.id,
        port,
      })),
    );
  }

  return Response.json(container, { status: 201 });
};

export { GET, POST };
