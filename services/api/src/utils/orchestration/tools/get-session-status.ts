import { z } from "zod";
import { tool } from "ai";
import { findSessionById } from "../../repositories/session.repository";
import { getInferenceStatus } from "../../stores/inference-status-store";

const inputSchema = z.object({
  sessionId: z.string().describe("The session ID to check status for"),
});

export const getSessionStatusTool = tool({
  description:
    "Gets the current status of a session including whether it is busy (inferring), idle, or complete.",
  inputSchema,
  execute: async ({ sessionId }) => {
    const session = await findSessionById(sessionId);

    if (!session) {
      return { error: "Session not found", status: null, lastActivity: null };
    }

    const inferenceStatus = getInferenceStatus(sessionId);

    return {
      status: session.status,
      inferenceStatus,
      lastActivity: session.updatedAt?.toISOString() ?? session.createdAt?.toISOString(),
    };
  },
});
