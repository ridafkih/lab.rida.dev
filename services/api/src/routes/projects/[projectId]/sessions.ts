import {
  findContainersByProjectId,
  createSessionContainer,
} from "../../../utils/repositories/container.repository";
import {
  createSession,
  findSessionsByProjectId,
} from "../../../utils/repositories/session.repository";
import { publisher } from "../../../clients/publisher";
import type { RouteHandler } from "../../../utils/handlers/route-handler";

const GET: RouteHandler = async (_request, params) => {
  const sessions = await findSessionsByProjectId(params.projectId);
  return Response.json(sessions);
};

const POST: RouteHandler = async (request, params, context) => {
  const { projectId } = params;
  const body = await request.json().catch(() => ({}));
  const title = typeof body.title === "string" ? body.title : undefined;

  const containerDefinitions = await findContainersByProjectId(projectId);

  if (containerDefinitions.length === 0) {
    return Response.json({ error: "Project has no container definitions" }, { status: 400 });
  }

  const session = await createSession(projectId, title);

  const containerRows = [];
  for (const containerDefinition of containerDefinitions) {
    const displayName =
      containerDefinition.hostname ??
      containerDefinition.image.split("/").pop()?.split(":")[0] ??
      "container";

    const sessionContainer = await createSessionContainer({
      sessionId: session.id,
      containerId: containerDefinition.id,
      dockerId: "",
      status: "starting",
    });

    containerRows.push({
      id: sessionContainer.id,
      name: displayName,
      status: "starting" as const,
      urls: [],
    });
  }

  publisher.publishDelta("sessions", {
    type: "add",
    session: {
      id: session.id,
      projectId: session.projectId,
      title: session.title,
    },
  });

  publisher.publishSnapshot("sessionContainers", { uuid: session.id }, containerRows);

  context.initializeSessionContainers(session.id, projectId).catch((error) => {
    console.error(`Background session initialization failed for ${session.id}:`, error);
  });

  return Response.json(
    {
      ...session,
      containers: containerRows,
    },
    { status: 201 },
  );
};

export { GET, POST };
