import { z } from "zod";
import { tool } from "ai";
import { findSessionById } from "../../repositories/session.repository";
import { sendMessageToSession } from "../message-sender";
import { getErrorMessage } from "../../shared/errors";
import type { OpencodeClient, Publisher } from "../../types/dependencies";
import type { SessionStateStore } from "../../state/session-state-store";
import { widelog } from "../../logging";

const inputSchema = z.object({
  sessionId: z.string().describe("The session ID to send the message to"),
  message: z.string().describe("The message content to send to the session"),
});

export interface SendMessageToolContext {
  modelId?: string;
  opencode: OpencodeClient;
  publisher: Publisher;
  sessionStateStore: SessionStateStore;
}

export function createSendMessageToSessionTool(context: SendMessageToolContext) {
  return tool({
    description:
      "Sends a message to an existing active session. Use this to forward the user's request or follow-up to a session that is already working on a task.",
    inputSchema,
    execute: async ({ sessionId, message }) => {
      const session = await findSessionById(sessionId);

      if (!session) {
        return { success: false, error: "Session not found" };
      }

      if (!session.opencodeSessionId) {
        return { success: false, error: "Session is not ready yet" };
      }

      try {
        await sendMessageToSession({
          sessionId,
          opencodeSessionId: session.opencodeSessionId,
          content: message,
          modelId: context.modelId,
          opencode: context.opencode,
          publisher: context.publisher,
          sessionStateStore: context.sessionStateStore,
        });

        return { success: true, sessionId };
      } catch (error) {
        widelog.errorFields(error, { prefix: "orchestration.tool.send_message_to_session.error" });
        return { success: false, error: getErrorMessage(error) };
      }
    },
  });
}
