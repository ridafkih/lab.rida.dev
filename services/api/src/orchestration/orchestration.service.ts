import type {
  MessagingMode,
  OrchestrationStatus,
  ResolutionConfidence,
} from "@lab/database/schema/orchestration-requests";
import type { BrowserServiceManager } from "../managers/browser-service.manager";
import type { PoolManager } from "../managers/pool.manager";
import type { SessionLifecycleManager } from "../managers/session-lifecycle.manager";
import {
  createOrchestrationRequest,
  updateOrchestrationStatus,
} from "../repositories/orchestration-request.repository";
import {
  findAllProjects,
  findProjectById,
} from "../repositories/project.repository";
import { findSessionById } from "../repositories/session.repository";
import type { SandboxAgentClientResolver } from "../sandbox-agent/client-resolver";
import { NotFoundError } from "../shared/errors";
import type { SessionStateStore } from "../state/session-state-store";
import type { Publisher } from "../types/dependencies";
import { initiateConversation } from "./conversation-initiator";
import { sendMessageToSession } from "./message-sender";
import {
  type ProjectResolutionResult,
  resolveProject,
} from "./project-resolver";
import { spawnSession } from "./session-spawner";

interface OrchestrationInput {
  content: string;
  channelId?: string;
  modelId?: string;
  platformOrigin?: string;
  platformChatId?: string;
  messagingMode?: MessagingMode;
  browserService: BrowserServiceManager;
  sessionLifecycle: SessionLifecycleManager;
  poolManager: PoolManager;
  sandboxAgentResolver: SandboxAgentClientResolver;
  publisher: Publisher;
  sessionStateStore: SessionStateStore;
}

interface OrchestrationResult {
  orchestrationId: string | null;
  sessionId: string;
  projectId: string;
  projectName: string | null;
}

interface OrchestrationContext {
  id: string;
  content: string;
  modelId?: string;
  browserService: BrowserServiceManager;
  sessionLifecycle: SessionLifecycleManager;
  poolManager: PoolManager;
  sandboxAgentResolver: SandboxAgentClientResolver;
  publisher: Publisher;
  sessionStateStore: SessionStateStore;
}

async function transitionTo(
  orchestrationId: string,
  status: OrchestrationStatus,
  publisher: Publisher,
  data?: {
    resolvedProjectId?: string;
    resolvedSessionId?: string;
    resolutionConfidence?: ResolutionConfidence;
    resolutionReasoning?: string;
    projectName?: string | null;
    sessionId?: string | null;
    errorMessage?: string | null;
  }
): Promise<void> {
  await updateOrchestrationStatus(orchestrationId, status, {
    resolvedProjectId: data?.resolvedProjectId,
    resolvedSessionId: data?.resolvedSessionId,
    resolutionConfidence: data?.resolutionConfidence,
    resolutionReasoning: data?.resolutionReasoning,
    errorMessage: data?.errorMessage,
  });

  publisher.publishDelta(
    "orchestrationStatus",
    { uuid: orchestrationId },
    {
      status,
      projectName: data?.projectName,
      sessionId: data?.sessionId,
      errorMessage: data?.errorMessage,
    }
  );
}

function initializeStatusChannel(
  orchestrationId: string,
  publisher: Publisher
): void {
  publisher.publishSnapshot(
    "orchestrationStatus",
    { uuid: orchestrationId },
    {
      status: "pending",
      projectName: null,
      sessionId: null,
      errorMessage: null,
    }
  );
}

async function resolveTargetProject(
  ctx: OrchestrationContext
): Promise<ProjectResolutionResult> {
  await transitionTo(ctx.id, "thinking", ctx.publisher);

  const projects = await findAllProjects();
  if (projects.length === 0) {
    throw new NotFoundError("Project");
  }

  const resolution = await resolveProject(ctx.content, projects);

  await transitionTo(ctx.id, "delegating", ctx.publisher, {
    resolvedProjectId: resolution.projectId,
    resolutionConfidence: resolution.confidence,
    resolutionReasoning: resolution.reasoning,
    projectName: resolution.projectName,
  });

  return resolution;
}

async function spawnSessionForProject(
  ctx: OrchestrationContext,
  resolution: ProjectResolutionResult
): Promise<string> {
  await transitionTo(ctx.id, "starting", ctx.publisher, {
    projectName: resolution.projectName,
  });

  const { session } = await spawnSession({
    projectId: resolution.projectId,
    taskSummary: ctx.content,
    browserService: ctx.browserService,
    sessionLifecycle: ctx.sessionLifecycle,
    poolManager: ctx.poolManager,
    publisher: ctx.publisher,
  });

  return session.id;
}

async function startConversation(
  ctx: OrchestrationContext,
  sessionId: string
): Promise<void> {
  await initiateConversation({
    sessionId,
    task: ctx.content,
    modelId: ctx.modelId,
    sandboxAgentResolver: ctx.sandboxAgentResolver,
    publisher: ctx.publisher,
    sessionStateStore: ctx.sessionStateStore,
  });
}

async function markComplete(
  ctx: OrchestrationContext,
  sessionId: string,
  projectName: string
): Promise<void> {
  await transitionTo(ctx.id, "complete", ctx.publisher, {
    resolvedSessionId: sessionId,
    projectName,
    sessionId,
  });
}

async function markFailed(
  orchestrationId: string,
  error: unknown,
  publisher: Publisher
): Promise<void> {
  const errorMessage = error instanceof Error ? error.message : "Unknown error";
  await transitionTo(orchestrationId, "error", publisher, { errorMessage });
}

export async function orchestrate(
  input: OrchestrationInput
): Promise<OrchestrationResult> {
  const { sandboxAgentResolver, publisher, sessionStateStore } = input;

  if (input.channelId) {
    const existingSession = await findSessionById(input.channelId);
    if (existingSession?.sandboxSessionId) {
      await sendMessageToSession({
        sessionId: input.channelId,
        sandboxSessionId: existingSession.sandboxSessionId,
        content: input.content,
        sandboxAgentResolver,
        publisher,
        sessionStateStore,
      });

      return {
        orchestrationId: null,
        sessionId: input.channelId,
        projectId: existingSession.projectId,
        projectName:
          (await findProjectById(existingSession.projectId))?.name ?? null,
      };
    }
  }

  const orchestrationId = await createOrchestrationRequest({
    content: input.content,
    channelId: input.channelId,
    modelId: input.modelId,
    platformOrigin: input.platformOrigin,
    platformChatId: input.platformChatId,
    messagingMode: input.messagingMode,
  });

  initializeStatusChannel(orchestrationId, publisher);

  const context: OrchestrationContext = {
    id: orchestrationId,
    content: input.content,
    modelId: input.modelId,
    browserService: input.browserService,
    sessionLifecycle: input.sessionLifecycle,
    poolManager: input.poolManager,
    sandboxAgentResolver,
    publisher,
    sessionStateStore,
  };

  try {
    const resolution = await resolveTargetProject(context);
    const sessionId = await spawnSessionForProject(context, resolution);
    await startConversation(context, sessionId);
    await markComplete(context, sessionId, resolution.projectName);

    return {
      orchestrationId,
      sessionId,
      projectId: resolution.projectId,
      projectName: resolution.projectName,
    };
  } catch (error) {
    await markFailed(orchestrationId, error, publisher);
    throw error;
  }
}
