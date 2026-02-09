import {
  type BrowserSessionState,
  createDaemonController,
  type DaemonController,
  type StateStore,
} from "@lab/browser-protocol";
import { sleep } from "bun";
import { TIMING } from "../config/constants";
import {
  getFirstExposedPort,
  getFirstExposedService,
} from "../repositories/container-session.repository";
import { ExternalServiceError, NotFoundError } from "../shared/errors";
import { type BrowserService, createBrowserService } from "./browser-service";
import {
  deleteSession,
  getAllSessions,
  getState,
  setCurrentState,
  setDesiredState,
  setLastUrl,
  setState,
  transitionState,
  updateHeartbeat,
} from "./state-store";

interface BrowserBootstrapConfig {
  browserApiUrl: string;
  browserWsUrl: string;
  containerScheme: string;
  cleanupDelayMs: number;
  reconcileIntervalMs: number;
  maxRetries: number;
  proxyInternalUrl: string;
  proxyBaseUrl: string;
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

function createGetInitialNavigationUrl(config: BrowserBootstrapConfig) {
  return async function getInitialNavigationUrl(
    sessionId: string,
    _port: number
  ): Promise<string> {
    const service = await getFirstExposedService(sessionId);
    if (!service) {
      throw new NotFoundError("Exposed service", sessionId);
    }
    return `${config.containerScheme}//${service.hostname}:${service.port}/`;
  };
}

function createWaitForService(config: BrowserBootstrapConfig) {
  return async function waitForService(
    sessionId: string,
    port: number,
    timeoutMs = TIMING.SERVICE_WAIT_TIMEOUT_MS,
    intervalMs = TIMING.SERVICE_WAIT_INTERVAL_MS
  ): Promise<void> {
    const proxyUrl = `${config.proxyInternalUrl}/`;
    const hostHeader = `${sessionId}--${port}.${new URL(config.proxyBaseUrl).host}`;
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
          return;
        }
      }
      await sleep(intervalMs);
    }

    throw new ExternalServiceError(
      `Service not available: ${sessionId}--${port} (last status: ${lastStatus})`,
      "SERVICE_NOT_AVAILABLE"
    );
  };
}

export interface BrowserBootstrapResult {
  browserService: BrowserService;
  daemonController: DaemonController;
}

export const bootstrapBrowserService = (
  config: BrowserBootstrapConfig
): BrowserBootstrapResult => {
  const baseUrl = config.browserApiUrl;

  const daemonController = createDaemonController({ baseUrl });

  const browserService = createBrowserService(
    {
      browserWsUrl: config.browserWsUrl,
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
      getInitialNavigationUrl: createGetInitialNavigationUrl(config),
      waitForService: createWaitForService(config),
    }
  );

  return { browserService, daemonController };
};

export const shutdownBrowserService = (service: BrowserService): void => {
  service.stopReconciler();
};
