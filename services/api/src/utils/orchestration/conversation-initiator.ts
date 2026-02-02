import { opencode } from "../../clients/opencode";
import { updateSessionOpencodeId } from "../repositories/session.repository";
import { resolveWorkspacePath } from "../workspace/resolve-path";

export interface InitiateConversationOptions {
  sessionId: string;
  task: string;
  modelId?: string;
}

export async function initiateConversation(options: InitiateConversationOptions): Promise<void> {
  const { sessionId, task, modelId } = options;
  const workspacePath = await resolveWorkspacePath(sessionId);

  const createResponse = await opencode.session.create({ directory: workspacePath });
  if (createResponse.error || !createResponse.data) {
    throw new Error(`Failed to create OpenCode session: ${JSON.stringify(createResponse.error)}`);
  }

  const opencodeSessionId = createResponse.data.id;
  await updateSessionOpencodeId(sessionId, opencodeSessionId);

  const [providerID, modelID] = modelId?.split("/") ?? [];

  const promptResponse = await opencode.session.promptAsync({
    sessionID: opencodeSessionId,
    directory: workspacePath,
    model: providerID && modelID ? { providerID, modelID } : undefined,
    parts: [{ type: "text", text: task }],
  });

  if (promptResponse.error) {
    throw new Error(`Failed to send initial message: ${JSON.stringify(promptResponse.error)}`);
  }
}
