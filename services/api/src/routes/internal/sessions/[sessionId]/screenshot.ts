import { findSessionByIdOrThrow } from "../../../../repositories/session.repository";
import { NotFoundError } from "../../../../shared/errors";
import { withParams } from "../../../../shared/route-helpers";
import type { BrowserContext } from "../../../../types/route";
import { widelog } from "../../../../logging";

const GET = withParams<{ sessionId: string }, BrowserContext>(
  ["sessionId"],
  async ({ sessionId }, _request, context) => {
    widelog.set("session.id", sessionId);
    await findSessionByIdOrThrow(sessionId);

    const cachedFrame = context.browserService.service.getCachedFrame(sessionId);

    widelog.set("screenshot.has_frame", !!cachedFrame);
    if (!cachedFrame) {
      throw new NotFoundError("Browser frame");
    }

    return Response.json({
      sessionId,
      timestamp: Date.now(),
      format: "png",
      encoding: "base64",
      data: cachedFrame,
    });
  },
);

export { GET };
