import { initializeSessionContainers } from "../runtime/containers";
import {
  cleanupOrphanedNetworks,
  cleanupSessionNetwork,
} from "../runtime/network";
import type { ProxyManager } from "../services/proxy.service";
import { SessionCleanupService } from "../services/session-cleanup.service";
import type { DeferredPublisher } from "../shared/deferred-publisher";
import type { SessionStateStore } from "../state/session-state-store";
import type { Sandbox } from "../types/dependencies";
import type { SidecarProvider } from "../types/sidecar";
import type { BrowserServiceManager } from "./browser-service.manager";

export class SessionLifecycleManager {
  private readonly initializationTasks = new Map<string, Promise<void>>();

  private readonly sandbox: Sandbox;
  private readonly proxyManager: ProxyManager;
  private readonly browserServiceManager: BrowserServiceManager;
  private readonly deferredPublisher: DeferredPublisher;
  private readonly sessionStateStore: SessionStateStore;
  private readonly sidecarProviders: SidecarProvider[];

  constructor(
    sandbox: Sandbox,
    proxyManager: ProxyManager,
    browserServiceManager: BrowserServiceManager,
    deferredPublisher: DeferredPublisher,
    sessionStateStore: SessionStateStore,
    sidecarProviders: SidecarProvider[] = []
  ) {
    this.sandbox = sandbox;
    this.proxyManager = proxyManager;
    this.browserServiceManager = browserServiceManager;
    this.deferredPublisher = deferredPublisher;
    this.sessionStateStore = sessionStateStore;
    this.sidecarProviders = sidecarProviders;
  }

  private getDeps() {
    const cleanupService = new SessionCleanupService({
      sandbox: this.sandbox,
      publisher: this.deferredPublisher.get(),
      proxyManager: this.proxyManager,
      sessionStateStore: this.sessionStateStore,
      sidecarProviders: this.sidecarProviders,
      cleanupSessionNetwork: (sessionId: string) =>
        cleanupSessionNetwork(sessionId, this.sandbox),
    });

    return {
      sandbox: this.sandbox,
      publisher: this.deferredPublisher.get(),
      proxyManager: this.proxyManager,
      cleanupService,
    };
  }

  async initialize(): Promise<void> {
    await cleanupOrphanedNetworks(this.sandbox);
  }

  async initializeSession(sessionId: string, projectId: string): Promise<void> {
    await initializeSessionContainers(
      sessionId,
      projectId,
      this.browserServiceManager.service,
      this.getDeps()
    );

    const sidecarResults = await Promise.allSettled(
      this.sidecarProviders.map((provider) =>
        provider.spawnForSession(sessionId)
      )
    );

    for (const result of sidecarResults) {
      if (result.status === "rejected") {
        const error = result.reason;
        const message = error instanceof Error ? error.message : String(error);
        const stack = error instanceof Error ? error.stack : undefined;
        console.error(
          `[SessionLifecycle] Sidecar spawn failed for session ${sessionId}:`,
          message,
          stack
        );
      }
    }
  }

  scheduleInitializeSession(
    sessionId: string,
    projectId: string
  ): Promise<void> {
    const existing = this.initializationTasks.get(sessionId);
    if (existing) {
      return existing;
    }

    const task = this.initializeSession(sessionId, projectId).finally(() => {
      this.initializationTasks.delete(sessionId);
    });

    this.initializationTasks.set(sessionId, task);
    return task;
  }

  hasPendingInitialization(sessionId: string): boolean {
    return this.initializationTasks.has(sessionId);
  }

  async cleanupSession(sessionId: string): Promise<void> {
    const { cleanupService } = this.getDeps();
    await cleanupService.cleanupSessionFull(
      sessionId,
      this.browserServiceManager.service
    );
  }
}
