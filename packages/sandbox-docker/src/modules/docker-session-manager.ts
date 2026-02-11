import type {
  SandboxProvider,
  SessionManager,
  SessionNetwork,
} from "@lab/sandbox-sdk";

const SESSION_LABEL = "lab.session";

export interface DockerSessionManagerConfig {
  sharedContainerNames?: string[];
}

function formatNetworkName(sessionId: string): string {
  return `lab-${sessionId}`;
}

export class DockerSessionManager implements SessionManager {
  private readonly provider: SandboxProvider;
  private readonly sharedContainerNames: string[];

  constructor(
    provider: SandboxProvider,
    config: DockerSessionManagerConfig = {}
  ) {
    this.provider = provider;
    this.sharedContainerNames = (config.sharedContainerNames ?? []).filter(
      Boolean
    );
  }

  async createSessionNetwork(sessionId: string): Promise<SessionNetwork> {
    const networkId = formatNetworkName(sessionId);
    await this.provider.createNetwork(networkId, {
      labels: { [SESSION_LABEL]: sessionId },
    });
    await this.connectSharedContainers(networkId);
    return { id: networkId };
  }

  async removeSessionNetwork(sessionId: string): Promise<void> {
    const networkId = formatNetworkName(sessionId);
    await this.disconnectSharedContainers(networkId);
    await this.provider.removeNetwork(networkId);
  }

  async cleanupOrphanedSessionNetworks(
    activeSessionIds: string[]
  ): Promise<number> {
    const networks = await this.provider.listNetworks({
      labels: [SESSION_LABEL],
    });
    const active = new Set(activeSessionIds);

    const orphanedNetworkIds = this.getOrphanedSessionNetworkIds(
      networks,
      active
    );

    await Promise.all(
      orphanedNetworkIds.map((networkId) =>
        this.removeSessionNetworkById(networkId).catch((error) =>
          console.warn("[Network] Session network cleanup failed:", error)
        )
      )
    );

    return orphanedNetworkIds.length;
  }

  async reconcileSessionNetworks(activeSessionIds: string[]): Promise<void> {
    if (
      activeSessionIds.length === 0 ||
      this.sharedContainerNames.length === 0
    ) {
      return;
    }

    console.log(
      `[Network] Reconciling network connections for ${activeSessionIds.length} sessions`
    );

    const networks = await this.provider.listNetworks({
      labels: [SESSION_LABEL],
    });
    const active = new Set(activeSessionIds);
    const orphanedNetworkIds = this.getOrphanedSessionNetworkIds(
      networks,
      active
    );

    await Promise.all(
      orphanedNetworkIds.map((networkId) =>
        this.disconnectSharedContainers(networkId).catch((error) =>
          console.warn(
            `[Network] Failed to prune shared container connections for ${networkId}:`,
            error
          )
        )
      )
    );

    for (const sessionId of activeSessionIds) {
      const networkId = formatNetworkName(sessionId);
      const exists = await this.provider.networkExists(networkId);
      if (!exists) {
        continue;
      }
      await this.connectSharedContainers(networkId);
    }

    console.log("[Network] Network reconciliation complete");
  }

  private async connectSharedContainers(networkId: string): Promise<void> {
    await Promise.all(
      this.sharedContainerNames.map(async (containerName) => {
        try {
          const connected = await this.provider.isConnectedToNetwork(
            containerName,
            networkId
          );
          if (!connected) {
            await this.provider.connectToNetwork(containerName, networkId);
          }
        } catch (error) {
          console.warn(
            `[Network] Failed to connect shared container ${containerName} to network ${networkId}:`,
            error
          );
        }
      })
    );
  }

  private async disconnectSharedContainers(networkId: string): Promise<void> {
    for (const containerName of this.sharedContainerNames) {
      try {
        const connected = await this.provider.isConnectedToNetwork(
          containerName,
          networkId
        );
        if (connected) {
          await this.provider.disconnectFromNetwork(containerName, networkId);
        }
      } catch (error) {
        console.warn(
          `[Network] Failed to disconnect shared container ${containerName} from network ${networkId}:`,
          error
        );
      }
    }
  }

  private getOrphanedSessionNetworkIds(
    networks: { name: string; labels: Record<string, string> }[],
    activeSessionIds: Set<string>
  ): string[] {
    return networks
      .map((network) => network.labels[SESSION_LABEL])
      .filter(
        (sessionId): sessionId is string =>
          !!sessionId && !activeSessionIds.has(sessionId)
      )
      .map((sessionId) => formatNetworkName(sessionId));
  }

  private async removeSessionNetworkById(networkId: string): Promise<void> {
    await this.disconnectSharedContainers(networkId);
    await this.provider.removeNetwork(networkId);
  }
}
