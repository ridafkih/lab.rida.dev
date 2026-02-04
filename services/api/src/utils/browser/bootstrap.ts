import {
  type BrowserSessionState,
  type DaemonController,
  type StateStore,
} from "@lab/browser-protocol";
import { getFirstExposedPort, getFirstExposedService } from "../repositories/container.repository";
import { createBrowserService, type BrowserService } from "./browser-service";
import {
  getState,
  setState,
  setDesiredState,
  setCurrentState,
  transitionState,
  getAllSessions,
  deleteSession,
  updateHeartbeat,
  setLastUrl,
} from "./state-store";
import {
  start,
  stop,
  navigate,
  getStatus,
  getCurrentUrl,
  launch,
  isHealthy,
  executeCommand,
} from "./daemon-controller";

export interface BrowserBootstrapConfig {
  browserApiUrl: string;
  browserWsHost: string;
  cleanupDelayMs: number;
  reconcileIntervalMs: number;
  maxRetries: number;
  publishFrame: (sessionId: string, frame: string, timestamp: number) => void;
  publishStateChange: (sessionId: string, state: BrowserSessionState) => void;
}

const stateStore: StateStore = {
  getState,
  setState,
  setDesiredState,
  setCurrentState,
  transitionState,
  getAllSessions,
  deleteSession,
  updateHeartbeat,
  setLastUrl,
};

async function getInitialNavigationUrl(sessionId: string, _port: number): Promise<string> {
  const service = await getFirstExposedService(sessionId);
  if (!service) {
    throw new Error(`No exposed service found for session ${sessionId}`);
  }
  return `http://${service.hostname}:${service.port}/`;
}

async function waitForService(
  sessionId: string,
  port: number,
  timeoutMs = 30000,
  intervalMs = 250,
): Promise<void> {
  const proxyUrl = "http://lab-proxy:8080/";
  const hostHeader = `${sessionId}--${port}.localhost`;
  const startTime = Date.now();
  let lastStatus: number | string = "no response";

  while (Date.now() - startTime < timeoutMs) {
    const response = await fetch(proxyUrl, {
      headers: { Host: hostHeader },
    }).catch((err) => {
      lastStatus = `fetch error: ${err.message}`;
      return null;
    });

    if (response) {
      lastStatus = response.status;
      if (response.ok) {
        const contentLength = response.headers.get("content-length");
        if (contentLength && parseInt(contentLength, 10) > 0) {
          return;
        }
      }
    }
    await Bun.sleep(intervalMs);
  }

  throw new Error(`Service not available: ${sessionId}--${port} (last status: ${lastStatus})`);
}

export interface BrowserBootstrapResult {
  browserService: BrowserService;
  daemonController: DaemonController;
}

export const bootstrapBrowserService = async (
  config: BrowserBootstrapConfig,
): Promise<BrowserBootstrapResult> => {
  const baseUrl = config.browserApiUrl;

  const daemonController: DaemonController = {
    start: (sessionId, url) => start(baseUrl, sessionId, url),
    stop: (sessionId) => stop(baseUrl, sessionId),
    navigate: (sessionId, url) => navigate(baseUrl, sessionId, url),
    getStatus: (sessionId) => getStatus(baseUrl, sessionId),
    getCurrentUrl: (sessionId) => getCurrentUrl(baseUrl, sessionId),
    launch: (sessionId) => launch(baseUrl, sessionId),
    isHealthy: () => isHealthy(baseUrl),
    executeCommand: (sessionId, command) => executeCommand(baseUrl, sessionId, command),
  };

  const browserService = await createBrowserService(
    {
      browserWsHost: config.browserWsHost,
      browserDaemonUrl: baseUrl,
      cleanupDelayMs: config.cleanupDelayMs,
      reconcileIntervalMs: config.reconcileIntervalMs,
      maxRetries: config.maxRetries,
    },
    {
      stateStore,
      daemonController,
      publishFrame: config.publishFrame,
      publishStateChange: config.publishStateChange,
      getFirstExposedPort,
      getInitialNavigationUrl,
      waitForService,
    },
  );

  return { browserService, daemonController };
};

export const shutdownBrowserService = (service: BrowserService): void => {
  service.stopReconciler();
};
