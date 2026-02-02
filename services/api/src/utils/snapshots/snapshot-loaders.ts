import { config } from "../../config/environment";
import { isContainerStatus } from "../../types/container";
import { getChangeType } from "../../types/file";
import { formatProxyUrl } from "../../types/session";
import { findProjectSummaries } from "../repositories/project.repository";
import { findAllSessionSummaries, findSessionById } from "../repositories/session.repository";
import {
  getSessionContainersWithDetails,
  findPortsByContainerId,
} from "../repositories/container.repository";
import { opencode } from "../../clients/opencode";
import { getInferenceStatus } from "../monitors/inference-status-store";
import { getLastMessage, setLastMessage } from "../monitors/last-message-store";
import { resolveWorkspacePathBySession } from "../workspace/resolve-path";
import type { BrowserService } from "../browser/browser-service";
import type { AppSchema } from "@lab/multiplayer-sdk";

export async function loadProjects() {
  return findProjectSummaries();
}

export async function loadSessions() {
  const sessions = await findAllSessionSummaries();
  return sessions.map((session) => ({
    ...session,
    title: session.title ?? null,
  }));
}

export async function loadSessionContainers(sessionId: string) {
  const rows = await getSessionContainersWithDetails(sessionId);

  return Promise.all(
    rows.map(async (row) => {
      const ports = await findPortsByContainerId(row.containerId);
      const name = row.image;
      const urls = ports.map(({ port }) => ({
        port,
        url: formatProxyUrl(sessionId, port, config.proxyBaseDomain),
      }));

      return {
        id: row.id,
        name,
        status: isContainerStatus(row.status) ? row.status : ("error" as const),
        urls,
      };
    }),
  );
}

export async function loadSessionChangedFiles(sessionId: string) {
  const session = await findSessionById(sessionId);
  if (!session?.opencodeSessionId) return [];

  try {
    const directory = await resolveWorkspacePathBySession(sessionId);
    const response = await opencode.session.diff({
      sessionID: session.opencodeSessionId,
      directory,
    });
    if (!response.data) return [];

    return response.data.map((diff) => ({
      path: diff.file,
      originalContent: diff.before,
      currentContent: diff.after,
      status: "pending" as const,
      changeType: getChangeType(diff.before, diff.after),
    }));
  } catch {
    return [];
  }
}

export async function loadSessionMetadata(sessionId: string) {
  const session = await findSessionById(sessionId);
  const title = session?.title ?? "";
  const inferenceStatus = getInferenceStatus(sessionId);
  const storedLastMessage = getLastMessage(sessionId);

  if (!session?.opencodeSessionId) {
    return { title, lastMessage: storedLastMessage, inferenceStatus, participantCount: 0 };
  }

  try {
    const directory = await resolveWorkspacePathBySession(sessionId);
    const response = await opencode.session.messages({
      sessionID: session.opencodeSessionId,
      directory,
    });
    const messages = response.data ?? [];
    const lastMessage = messages[messages.length - 1];
    const textPart = lastMessage?.parts?.find(
      (part: { type: string; text?: string }) => part.type === "text" && part.text,
    );

    const text = textPart && "text" in textPart && textPart.text;

    if (text) {
      setLastMessage(sessionId, text);
      return { title, lastMessage: text, inferenceStatus, participantCount: 0 };
    }

    return { title, lastMessage: storedLastMessage, inferenceStatus, participantCount: 0 };
  } catch {
    return { title, lastMessage: storedLastMessage, inferenceStatus, participantCount: 0 };
  }
}

type ChannelName = keyof AppSchema["channels"];
type SnapshotLoader = (session: string | null) => Promise<unknown>;

export function createSnapshotLoaders(
  browserService: BrowserService,
): Record<ChannelName, SnapshotLoader> {
  return {
    projects: async () => loadProjects(),
    sessions: async () => loadSessions(),
    sessionMetadata: async (session) => (session ? loadSessionMetadata(session) : null),
    sessionContainers: async (session) => (session ? loadSessionContainers(session) : null),
    sessionTyping: async () => [],
    sessionPromptEngineers: async () => [],
    sessionChangedFiles: async (session) => (session ? loadSessionChangedFiles(session) : null),
    sessionBranches: async () => [],
    sessionLinks: async () => [],
    sessionLogs: async () => [],
    sessionMessages: async () => [],
    sessionBrowserState: async (session) =>
      session ? browserService.getBrowserSnapshot(session) : null,
    sessionBrowserFrames: async (session) => {
      if (!session) return null;
      const frame = browserService.getCachedFrame(session);
      return { lastFrame: frame ?? null, timestamp: frame ? Date.now() : null };
    },
    sessionBrowserInput: async () => ({}),
    orchestrationStatus: async () => ({
      status: "pending",
      projectName: null,
      sessionId: null,
      errorMessage: null,
    }),
  };
}
