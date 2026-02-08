import { getSessionServices } from "../../../../repositories/container-session.repository";
import { findSessionByIdOrThrow } from "../../../../repositories/session.repository";
import { withParams } from "../../../../shared/route-helpers";
import type { ProxyContext } from "../../../../types/route";
import { widelog } from "../../../../logging";

const GET = withParams<{ sessionId: string }, ProxyContext>(
  ["sessionId"],
  async ({ sessionId }, _request, ctx) => {
    widelog.set("session.id", sessionId);
    await findSessionByIdOrThrow(sessionId);

    const services = await getSessionServices(sessionId);
    widelog.set("service.count", services.length);

    return Response.json({
      sessionId,
      proxyBaseDomain: ctx.proxyBaseDomain,
      services: services.map((service) => ({
        containerId: service.containerId,
        runtimeId: service.runtimeId,
        image: service.image,
        status: service.status,
        ports: service.ports,
      })),
    });
  },
);

export { GET };
