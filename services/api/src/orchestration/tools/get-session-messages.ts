import { z } from "zod";
import { tool } from "ai";
import { findSessionById } from "../../repositories/session.repository";
import { resolveWorkspacePathBySession } from "../../shared/path-resolver";
import { isOpencodeMessage, extractTextFromParts } from "../opencode-messages";
import type { OpencodeClient } from "../../types/dependencies";

const inputSchema = z.object({
  sessionId: z.string().describe("The session ID to get messages from"),
  limit: z
    .number()
    .optional()
    .default(20)
    .describe("Maximum number of messages to return (most recent first)"),
});

export function createGetSessionMessagesTool(opencode: OpencodeClient) {
  return tool({
    description:
      "Gets conversation messages from a session. Returns messages in reverse chronological order (most recent first) with role and content.",
    inputSchema,
    execute: async ({ sessionId, limit }) => {
      const session = await findSessionById(sessionId);

      if (!session) {
        return { error: "Session not found", messages: [] };
      }

      if (!session.opencodeSessionId) {
        return { error: "Session has no conversation history yet", messages: [] };
      }

      try {
        const directory = await resolveWorkspacePathBySession(sessionId);
        const response = await opencode.session.messages({
          sessionID: session.opencodeSessionId,
          directory,
          limit: limit ?? 20,
        });

        const rawMessages = response.data ?? [];
        const messages = Array.isArray(rawMessages) ? rawMessages.filter(isOpencodeMessage) : [];

        return {
          messages: messages.map((msg) => ({
            role: msg.info.role,
            content: extractTextFromParts(msg.parts),
          })),
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        return { error: `Failed to fetch messages: ${message}`, messages: [] };
      }
    },
  });
}
