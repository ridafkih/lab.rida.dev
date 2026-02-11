import { updateSessionFields } from "../repositories/session.repository";
import type { SandboxAgentClientResolver } from "../sandbox-agent/client-resolver";
import { ExternalServiceError } from "../shared/errors";
import { resolveWorkspacePathBySession } from "../shared/path-resolver";
import type { SessionStateStore } from "../state/session-state-store";
import type { Publisher } from "../types/dependencies";

interface InitiateConversationOptions {
  sessionId: string;
  task: string;
  modelId?: string;
  sandboxAgentResolver: SandboxAgentClientResolver;
  publisher: Publisher;
  sessionStateStore: SessionStateStore;
}

function getDefaultModelId(): string | undefined {
  return process.env.DEFAULT_CONVERSATION_MODEL_ID;
}

export async function initiateConversation(
  options: InitiateConversationOptions
): Promise<void> {
  const {
    sessionId,
    task,
    sandboxAgentResolver,
    publisher,
    sessionStateStore,
  } = options;
  const modelId = options.modelId ?? getDefaultModelId();
  const workspacePath = await resolveWorkspacePathBySession(sessionId);

  const sandboxSessionId = crypto.randomUUID();
  const sandboxAgent = await sandboxAgentResolver.getClient(sessionId);

  try {
    await sandboxAgent.createSession(sandboxSessionId, {
      agent: "claude",
      model: modelId,
      permissionMode: "acceptEdits",
    });
  } catch (error) {
    throw new ExternalServiceError(
      `Failed to create Sandbox Agent session: ${error instanceof Error ? error.message : String(error)}`,
      "SANDBOX_AGENT_SESSION_CREATE_FAILED"
    );
  }

  await updateSessionFields(sessionId, {
    sandboxSessionId,
    workspaceDirectory: workspacePath,
  });

  try {
    await sandboxAgent.postMessage(sandboxSessionId, task);
  } catch (error) {
    throw new ExternalServiceError(
      `Failed to send initial message: ${error instanceof Error ? error.message : String(error)}`,
      "SANDBOX_AGENT_INITIAL_PROMPT_FAILED"
    );
  }

  await sessionStateStore.setLastMessage(sessionId, task);
  publisher.publishDelta(
    "sessionMetadata",
    { uuid: sessionId },
    { lastMessage: task }
  );
}
