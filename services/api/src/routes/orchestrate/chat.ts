import { z } from "zod";
import type { RouteHandler } from "../../utils/handlers/route-handler";
import { chatOrchestrate } from "../../utils/orchestration/chat-orchestrator";
import {
  saveOrchestratorMessage,
  getOrchestratorMessages,
} from "../../utils/repositories/orchestrator-message.repository";

const chatRequestSchema = z.object({
  content: z.string().min(1),
  platformOrigin: z.string(),
  platformChatId: z.string(),
  modelId: z.string().optional(),
  timestamp: z.string().datetime().optional(),
});

const POST: RouteHandler = async (request, _params, context) => {
  const rawBody = await request.json().catch(() => null);
  const parseResult = chatRequestSchema.safeParse(rawBody);

  if (!parseResult.success) {
    return Response.json(
      {
        error:
          "Invalid request body. Required: { content: string, platformOrigin: string, platformChatId: string, modelId?: string }",
      },
      { status: 400 },
    );
  }

  const body = parseResult.data;
  const content = body.content.trim();

  try {
    await saveOrchestratorMessage({
      platform: body.platformOrigin,
      platformChatId: body.platformChatId,
      role: "user",
      content,
    });

    const history = await getOrchestratorMessages({
      platform: body.platformOrigin,
      platformChatId: body.platformChatId,
      limit: 20,
    });

    const conversationHistory = history.map((msg) => `${msg.role}: ${msg.content}`);

    const result = await chatOrchestrate({
      content,
      conversationHistory,
      platformOrigin: body.platformOrigin,
      platformChatId: body.platformChatId,
      browserService: context.browserService,
      daemonController: context.daemonController,
      modelId: body.modelId,
      timestamp: body.timestamp,
    });

    await saveOrchestratorMessage({
      platform: body.platformOrigin,
      platformChatId: body.platformChatId,
      role: "assistant",
      content: result.message,
      sessionId: result.sessionId,
    });

    return Response.json(result, { status: 200 });
  } catch (error) {
    console.error("[ChatOrchestrate] Error:", error);
    const message = error instanceof Error ? error.message : "Chat orchestration failed";
    return Response.json({ error: message }, { status: 500 });
  }
};

export { POST };
