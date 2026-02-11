import type { AppSchema } from "@lab/multiplayer-sdk";
import type { BrowserService } from "../browser/browser-service";
import type { LogMonitor } from "../monitors/log.monitor";
import { findPortsByContainerId } from "../repositories/container-port.repository";
import { getSessionContainersWithDetails } from "../repositories/container-session.repository";
import { findProjectSummaries } from "../repositories/project.repository";
import {
  findAllSessionSummaries,
  findSessionById,
} from "../repositories/session.repository";
import type { SandboxAgentClientResolver } from "../sandbox-agent/client-resolver";
import { formatProxyUrl } from "../shared/naming";
import type { SessionStateStore } from "../state/session-state-store";
import { CONTAINER_STATUS, isContainerStatus } from "../types/container";

export function loadProjects() {
  return findProjectSummaries();
}

export async function loadSessions() {
  const sessions = await findAllSessionSummaries();
  return sessions.map((session) => ({
    ...session,
    title: session.title ?? null,
  }));
}

export async function loadSessionContainers(
  sessionId: string,
  proxyBaseUrl: string
) {
  const rows = await getSessionContainersWithDetails(sessionId);

  return Promise.all(
    rows.map(async (row) => {
      const ports = await findPortsByContainerId(row.containerId);
      const name = row.image;
      const urls = ports.map(({ port }) => ({
        port,
        url: formatProxyUrl(sessionId, port, proxyBaseUrl),
      }));

      return {
        id: row.id,
        name,
        status: isContainerStatus(row.status)
          ? row.status
          : CONTAINER_STATUS.ERROR,
        urls,
      };
    })
  );
}

export function loadSessionChangedFiles(
  _sessionId: string,
  _sandboxAgentResolver: SandboxAgentClientResolver
) {
  // Sandbox Agent doesn't provide a direct diff API.
  // File diffs are tracked via item.completed events with file_ref parts
  // and published in real-time by the monitor. Return empty for snapshot.
  return [];
}

export function loadSessionLogs(sessionId: string, logMonitor: LogMonitor) {
  return logMonitor.getSessionSnapshot(sessionId);
}

export async function loadSessionMetadata(
  sessionId: string,
  _sandboxAgentResolver: SandboxAgentClientResolver,
  sessionStateStore: SessionStateStore
) {
  const session = await findSessionById(sessionId);
  const title = session?.title ?? "";
  const [inferenceStatus, storedLastMessage] = await Promise.all([
    sessionStateStore.getInferenceStatus(sessionId),
    sessionStateStore.getLastMessage(sessionId),
  ]);

  return {
    title,
    lastMessage: storedLastMessage,
    inferenceStatus,
    participantCount: 0,
  };
}

type ChannelName = keyof AppSchema["channels"];
type SnapshotLoader = (session: string | null) => Promise<unknown>;

export interface SnapshotLoaderDeps {
  browserService: BrowserService;
  sandboxAgentResolver: SandboxAgentClientResolver;
  logMonitor: LogMonitor;
  proxyBaseUrl: string;
  sessionStateStore: SessionStateStore;
}

export function createSnapshotLoaders(
  deps: SnapshotLoaderDeps
): Record<ChannelName, SnapshotLoader> {
  const {
    browserService,
    sandboxAgentResolver,
    logMonitor,
    proxyBaseUrl,
    sessionStateStore,
  } = deps;

  return {
    projects: () => loadProjects(),
    sessions: () => loadSessions(),
    sessionMetadata: (session) =>
      session
        ? loadSessionMetadata(session, sandboxAgentResolver, sessionStateStore)
        : Promise.resolve(null),
    sessionContainers: (session) =>
      session
        ? loadSessionContainers(session, proxyBaseUrl)
        : Promise.resolve(null),
    sessionTyping: () => Promise.resolve([]),
    sessionPromptEngineers: () => Promise.resolve([]),
    sessionChangedFiles: (session) =>
      session
        ? Promise.resolve(
            loadSessionChangedFiles(session, sandboxAgentResolver)
          )
        : Promise.resolve(null),
    sessionBranches: () => Promise.resolve([]),
    sessionLinks: () => Promise.resolve([]),
    sessionLogs: (session) =>
      session
        ? Promise.resolve(loadSessionLogs(session, logMonitor))
        : Promise.resolve({ sources: [], recentLogs: {} }),
    sessionMessages: () => Promise.resolve([]),
    sessionBrowserState: (session) =>
      session
        ? browserService.getBrowserSnapshot(session)
        : Promise.resolve(null),
    sessionBrowserFrames: (session) => {
      if (!session) {
        return Promise.resolve(null);
      }
      const frame = browserService.getCachedFrame(session);
      return Promise.resolve({
        lastFrame: frame ?? null,
        timestamp: frame ? Date.now() : null,
      });
    },
    sessionBrowserInput: () => Promise.resolve({}),
    orchestrationStatus: () =>
      Promise.resolve({
        status: "pending",
        projectName: null,
        sessionId: null,
        errorMessage: null,
      }),
    sessionComplete: () => Promise.resolve({ completed: false }),
  };
}
