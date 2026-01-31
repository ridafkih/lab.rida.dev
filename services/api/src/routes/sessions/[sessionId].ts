import { docker } from "../../clients/docker";
import { notFoundResponse, noContentResponse } from "../../shared/http";
import {
  findSessionById,
  updateSessionOpencodeId,
  updateSessionTitle,
} from "../../utils/repositories/session.repository";
import { findSessionContainersBySessionId } from "../../utils/repositories/container.repository";
import { cleanupSession } from "../../utils/session/session-cleanup";
import type { RouteHandler } from "../../utils/handlers/route-handler";

const GET: RouteHandler = async (_request, params) => {
  const session = await findSessionById(params.sessionId);
  if (!session) return notFoundResponse();

  const containers = await findSessionContainersBySessionId(params.sessionId);

  const containersWithStatus = await Promise.all(
    containers.map(async (container) => {
      if (!container.dockerId) return { ...container, info: null };
      const info = await docker.inspectContainer(container.dockerId);
      return { ...container, info };
    }),
  );

  return Response.json({ ...session, containers: containersWithStatus });
};

const PATCH: RouteHandler = async (request, params) => {
  let session = await findSessionById(params.sessionId);
  if (!session) return notFoundResponse();

  const body = await request.json();

  if (typeof body.opcodeSessionId === "string") {
    session = await updateSessionOpencodeId(params.sessionId, body.opcodeSessionId);
  }

  if (typeof body.title === "string") {
    session = await updateSessionTitle(params.sessionId, body.title);
  }

  return Response.json(session);
};

const DELETE: RouteHandler = async (_request, params, context) => {
  const session = await findSessionById(params.sessionId);
  if (!session) return notFoundResponse();

  await cleanupSession(params.sessionId, context.browserService);
  return noContentResponse();
};

export { DELETE, GET, PATCH };
