import { badRequestResponse, notFoundResponse } from "../../../../shared/http";
import { getSessionServices } from "../../../../utils/repositories/container.repository";
import { findSessionById } from "../../../../utils/repositories/session.repository";
import { config } from "../../../../config/environment";
import type { RouteHandler } from "../../../../utils/handlers/route-handler";

const GET: RouteHandler = async (_request, params) => {
  const sessionId = Array.isArray(params.sessionId) ? params.sessionId[0] : params.sessionId;
  if (!sessionId) return badRequestResponse("Missing sessionId");

  const session = await findSessionById(sessionId);
  if (!session) return notFoundResponse();

  const services = await getSessionServices(sessionId);

  return Response.json({
    sessionId,
    proxyBaseDomain: config.proxyBaseDomain,
    services: services.map((service) => ({
      containerId: service.containerId,
      dockerId: service.dockerId,
      image: service.image,
      status: service.status,
      ports: service.ports,
    })),
  });
};

export { GET };
