import { opencode } from "../../clients/opencode";
import { findSessionById, updateSessionOpencodeId } from "../repositories/session.repository";
import { getProjectSystemPrompt } from "../repositories/project.repository";
import { getSessionContainersWithPorts } from "../repositories/container.repository";
import { resolveWorkspacePathBySession } from "../workspace/resolve-path";
import { publisher } from "../../clients/publisher";
import { setLastMessage } from "../monitors/last-message-store";
import { createPromptContext } from "../prompts/context";
import { createDefaultPromptService } from "../prompts/builder";

export interface InitiateConversationOptions {
  sessionId: string;
  task: string;
  modelId?: string;
}

async function composeSystemPrompt(sessionId: string): Promise<string | undefined> {
  const session = await findSessionById(sessionId);
  if (!session) return undefined;

  const projectSystemPrompt = await getProjectSystemPrompt(session.projectId);
  const containers = await getSessionContainersWithPorts(sessionId);

  const promptContext = createPromptContext({
    sessionId,
    projectId: session.projectId,
    containers,
    projectSystemPrompt,
  });

  const promptService = createDefaultPromptService();
  const { text } = promptService.compose(promptContext);

  return text || undefined;
}

export async function initiateConversation(options: InitiateConversationOptions): Promise<void> {
  const { sessionId, task, modelId } = options;
  const workspacePath = await resolveWorkspacePathBySession(sessionId);

  const createResponse = await opencode.session.create({ directory: workspacePath });
  if (createResponse.error || !createResponse.data) {
    throw new Error(`Failed to create OpenCode session: ${JSON.stringify(createResponse.error)}`);
  }

  const opencodeSessionId = createResponse.data.id;
  await updateSessionOpencodeId(sessionId, opencodeSessionId, workspacePath);

  const [providerID, modelID] = modelId?.split("/") ?? [];
  const system = await composeSystemPrompt(sessionId);

  const promptResponse = await opencode.session.promptAsync({
    sessionID: opencodeSessionId,
    directory: workspacePath,
    model: providerID && modelID ? { providerID, modelID } : undefined,
    parts: [{ type: "text", text: task }],
    system,
    tools: { question: false },
  });

  if (promptResponse.error) {
    throw new Error(`Failed to send initial message: ${JSON.stringify(promptResponse.error)}`);
  }

  setLastMessage(sessionId, task);
  publisher.publishDelta("sessionMetadata", { uuid: sessionId }, { lastMessage: task });
}
