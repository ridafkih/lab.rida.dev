import type { SandboxAgentClientResolver } from "../sandbox-agent/client-resolver";
import { ExternalServiceError } from "../shared/errors";
import type { SessionStateStore } from "../state/session-state-store";
import type { Publisher } from "../types/dependencies";

interface SendMessageOptions {
  sessionId: string;
  sandboxSessionId: string;
  content: string;
  sandboxAgentResolver: SandboxAgentClientResolver;
  publisher: Publisher;
  sessionStateStore: SessionStateStore;
}

export async function sendMessageToSession(
  options: SendMessageOptions
): Promise<void> {
  const {
    sessionId,
    sandboxSessionId,
    content,
    sandboxAgentResolver,
    publisher,
    sessionStateStore,
  } = options;

  const sandboxAgent = await sandboxAgentResolver.getClient(sessionId);

  try {
    await sandboxAgent.postMessage(sandboxSessionId, content);
  } catch (error) {
    throw new ExternalServiceError(
      `Failed to send message to session: ${error instanceof Error ? error.message : String(error)}`,
      "SANDBOX_AGENT_PROMPT_FAILED"
    );
  }

  await sessionStateStore.setLastMessage(sessionId, content);
  publisher.publishDelta(
    "sessionMetadata",
    { uuid: sessionId },
    { lastMessage: content }
  );
}
