import { z } from "zod";
import { generateTaskSummary } from "../../../../generators/summary.generator";
import {
  findOrchestrationBySessionIdOrThrow,
  updateOrchestrationSummaryStatus,
} from "../../../../repositories/orchestration-request.repository";
import { parseRequestBody } from "../../../../shared/validation";
import { ValidationError } from "../../../../shared/errors";
import { withParams } from "../../../../shared/route-helpers";
import type { InfraContext } from "../../../../types/route";
import { widelog } from "../../../../logging";

const summaryRequestSchema = z.object({
  originalTask: z.string().optional(),
});

const POST = withParams<{ sessionId: string }, InfraContext>(
  ["sessionId"],
  async ({ sessionId }, request, ctx) => {
    widelog.set("session.id", sessionId);
    const { originalTask } = await parseRequestBody(request, summaryRequestSchema);

    const orchestration = await findOrchestrationBySessionIdOrThrow(sessionId);
    widelog.set("summary.messaging_mode", orchestration.messagingMode ?? "unknown");
    widelog.set("summary.current_status", orchestration.summaryStatus ?? "none");

    if (orchestration.messagingMode !== "passive") {
      throw new ValidationError("Summary generation only available for passive messaging mode");
    }

    if (orchestration.summaryStatus === "sent") {
      return Response.json({
        success: true,
        summary: orchestration.summaryText,
        alreadySent: true,
      });
    }

    try {
      await updateOrchestrationSummaryStatus(orchestration.id, "generating");

      const summary = await generateTaskSummary({
        sessionId,
        originalTask: originalTask || orchestration.content,
        platformOrigin: orchestration.platformOrigin ?? undefined,
        opencode: ctx.opencode,
      });

      await updateOrchestrationSummaryStatus(orchestration.id, "sent", summary.summary);

      return Response.json({
        success: summary.success,
        outcome: summary.outcome,
        summary: summary.summary,
        orchestrationId: orchestration.id,
        platformOrigin: orchestration.platformOrigin,
        platformChatId: orchestration.platformChatId,
      });
    } catch (error) {
      await updateOrchestrationSummaryStatus(orchestration.id, "failed");
      throw error;
    }
  },
);

export { POST };
