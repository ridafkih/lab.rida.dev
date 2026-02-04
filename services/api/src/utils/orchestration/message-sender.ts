import { opencode } from "../../clients/opencode";
import { findSessionById } from "../repositories/session.repository";
import { resolveWorkspacePathBySession } from "../workspace/resolve-path";
import { publisher } from "../../clients/publisher";
import { setLastMessage } from "../stores/last-message-store";

export interface SendMessageOptions {
  sessionId: string;
  opencodeSessionId: string;
  content: string;
  modelId?: string;
}

export async function sendMessageToSession(options: SendMessageOptions): Promise<void> {
  const { sessionId, opencodeSessionId, content, modelId } = options;

  const workspacePath = await resolveWorkspacePathBySession(sessionId);
  const [providerID, modelID] = modelId?.split("/") ?? [];

  const promptResponse = await opencode.session.promptAsync({
    sessionID: opencodeSessionId,
    directory: workspacePath,
    model: providerID && modelID ? { providerID, modelID } : undefined,
    parts: [{ type: "text", text: content }],
  });

  if (promptResponse.error) {
    throw new Error(`Failed to send message to session: ${JSON.stringify(promptResponse.error)}`);
  }

  setLastMessage(sessionId, content);
  publisher.publishDelta("sessionMetadata", { uuid: sessionId }, { lastMessage: content });
}
