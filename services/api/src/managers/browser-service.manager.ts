import type { DaemonController, BrowserSessionState } from "@lab/browser-protocol";
import {
  bootstrapBrowserService,
  shutdownBrowserService,
  type BrowserBootstrapResult,
} from "../browser/bootstrap";
import { cleanupOrphanedSessions } from "../browser/state-store";
import { LIMITS } from "../config/constants";
import type { BrowserService } from "../browser/browser-service";
import type { DeferredPublisher } from "../shared/deferred-publisher";
import { InternalError, ServiceUnavailableError } from "../shared/errors";

interface BrowserServiceConfig {
  apiUrl: string;
  wsHost: string;
  cleanupDelayMs: number;
  reconcileIntervalMs: number;
  maxRetries: number;
  proxyContainerName: string;
  proxyPort: number;
  proxyBaseDomain: string;
}

export class BrowserServiceManager {
  private result: BrowserBootstrapResult | null = null;
  private readonly lastFrameTime = new Map<string, number>();

  constructor(
    private readonly config: BrowserServiceConfig,
    private readonly deferredPublisher: DeferredPublisher,
  ) {}

  get isInitialized(): boolean {
    return this.result !== null;
  }

  get service(): BrowserService {
    if (!this.result) {
      throw new ServiceUnavailableError(
        "BrowserServiceManager not initialized - call initialize() first",
        "BROWSER_SERVICE_NOT_INITIALIZED",
      );
    }
    return this.result.browserService;
  }

  get daemonController(): DaemonController {
    if (!this.result) {
      throw new ServiceUnavailableError(
        "BrowserServiceManager not initialized - call initialize() first",
        "BROWSER_SERVICE_NOT_INITIALIZED",
      );
    }
    return this.result.daemonController;
  }

  async initialize(): Promise<void> {
    if (this.result) {
      throw new InternalError("BrowserServiceManager already initialized", "BROWSER_ALREADY_INIT");
    }

    await cleanupOrphanedSessions();

    const {
      apiUrl,
      wsHost,
      cleanupDelayMs,
      reconcileIntervalMs,
      maxRetries,
      proxyContainerName,
      proxyPort,
      proxyBaseDomain,
    } = this.config;

    this.result = await bootstrapBrowserService({
      browserApiUrl: apiUrl,
      browserWsHost: wsHost,
      cleanupDelayMs,
      reconcileIntervalMs,
      maxRetries,
      proxyContainerName,
      proxyPort,
      proxyBaseDomain,
      publishFrame: (sessionId: string, frame: string, timestamp: number) => {
        const now = Date.now();
        const last = this.lastFrameTime.get(sessionId) ?? 0;
        if (now - last < LIMITS.FRAME_MIN_INTERVAL_MS) return;
        this.lastFrameTime.set(sessionId, now);

        this.deferredPublisher
          .get()
          .publishEvent(
            "sessionBrowserFrames",
            { uuid: sessionId },
            { type: "frame" as const, data: frame, timestamp },
          );
      },
      publishStateChange: (sessionId: string, state: BrowserSessionState) => {
        // Clean up frame throttle tracking when browser session stops
        if (state.currentState === "stopped" || state.currentState === "error") {
          this.lastFrameTime.delete(sessionId);
        }
        this.deferredPublisher.get().publishSnapshot(
          "sessionBrowserState",
          { uuid: sessionId },
          {
            desiredState: state.desiredState,
            currentState: state.currentState,
            streamPort: state.streamPort ?? undefined,
            errorMessage: state.errorMessage ?? undefined,
          },
        );
      },
    });
  }

  startReconciler(): void {
    this.service.startReconciler();
  }

  shutdown(): void {
    if (!this.result) return;
    shutdownBrowserService(this.result.browserService);
  }
}
