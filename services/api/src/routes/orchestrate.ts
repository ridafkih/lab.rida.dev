import { z } from "zod";
import type { Handler, RouteContextFor } from "../types/route";
import { orchestrate } from "../orchestration";
import { parseRequestBody } from "../shared/validation";
import { widelog } from "../logging";

const orchestrationRequestSchema = z.object({
  content: z.string().min(1),
  channelId: z.string().optional(),
  modelId: z.string().optional(),
  platformOrigin: z.string().optional(),
  platformChatId: z.string().optional(),
  messagingMode: z.enum(["active", "passive"]).optional(),
});

type OrchestrationContext = RouteContextFor<"browser" | "session" | "infra">;

const POST: Handler<OrchestrationContext> = async (request, _params, context) => {
  const body = await parseRequestBody(request, orchestrationRequestSchema);

  if (body.platformOrigin) widelog.set("orchestration.platform_origin", body.platformOrigin);
  if (body.messagingMode) widelog.set("orchestration.messaging_mode", body.messagingMode);
  widelog.set("orchestration.has_model_id", !!body.modelId);

  const result = await orchestrate({
    content: body.content.trim(),
    channelId: body.channelId,
    modelId: body.modelId,
    platformOrigin: body.platformOrigin,
    platformChatId: body.platformChatId,
    messagingMode: body.messagingMode,
    browserService: context.browserService,
    sessionLifecycle: context.sessionLifecycle,
    poolManager: context.poolManager,
    opencode: context.opencode,
    publisher: context.publisher,
    sessionStateStore: context.sessionStateStore,
  });

  return Response.json(result, { status: 201 });
};

export { POST };
