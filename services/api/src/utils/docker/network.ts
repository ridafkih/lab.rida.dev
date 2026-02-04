import { docker } from "../../clients/docker";
import { config } from "../../config/environment";
import { LABELS } from "../../config/constants";
import { formatNetworkName } from "../../types/session";
import { findActiveSessionsForReconciliation } from "../repositories/session.repository";

async function connectContainerToNetworkIfNotConnected(
  containerName: string,
  networkName: string,
): Promise<void> {
  const isConnected = await docker.isConnectedToNetwork(containerName, networkName);
  if (isConnected) {
    return;
  }

  await docker.connectToNetwork(containerName, networkName);

  const verifyConnected = await docker.isConnectedToNetwork(containerName, networkName);
  if (!verifyConnected) {
    throw new Error(`Failed to verify connection of ${containerName} to network ${networkName}`);
  }
}

async function disconnectContainerFromNetworkIfConnected(
  containerName: string,
  networkName: string,
): Promise<void> {
  const isConnected = await docker.isConnectedToNetwork(containerName, networkName);
  if (!isConnected) {
    return;
  }

  await docker.disconnectFromNetwork(containerName, networkName);
}

export async function createSessionNetwork(sessionId: string): Promise<string> {
  const networkName = formatNetworkName(sessionId);
  await docker.createNetwork(networkName, { labels: { [LABELS.SESSION]: sessionId } });

  if (config.browserContainerName) {
    try {
      await connectContainerToNetworkIfNotConnected(config.browserContainerName, networkName);
    } catch (error) {
      console.warn(
        `[Network] Failed to connect browser container to network ${networkName}:`,
        error,
      );
    }
  }

  if (config.opencodeContainerName) {
    try {
      await connectContainerToNetworkIfNotConnected(config.opencodeContainerName, networkName);
    } catch (error) {
      console.warn(
        `[Network] Failed to connect opencode container to network ${networkName}:`,
        error,
      );
    }
  }

  return networkName;
}

export async function cleanupSessionNetwork(sessionId: string): Promise<void> {
  const networkName = formatNetworkName(sessionId);

  if (config.browserContainerName) {
    try {
      await disconnectContainerFromNetworkIfConnected(config.browserContainerName, networkName);
    } catch (error) {
      console.warn(`[Network] Failed to disconnect browser from network ${networkName}:`, error);
    }
  }

  if (config.opencodeContainerName) {
    try {
      await disconnectContainerFromNetworkIfConnected(config.opencodeContainerName, networkName);
    } catch (error) {
      console.warn(`[Network] Failed to disconnect opencode from network ${networkName}:`, error);
    }
  }

  await docker.removeNetwork(networkName);
}

export async function cleanupOrphanedNetworks(): Promise<number> {
  const networks = await docker.raw.listNetworks({
    filters: { label: [LABELS.SESSION] },
  });

  const activeSessions = await findActiveSessionsForReconciliation();
  const activeSessionIds = new Set(activeSessions.map((s) => s.id));

  const orphanedSessionIds = networks
    .map((n) => n.Labels?.[LABELS.SESSION])
    .filter((id): id is string => !!id && !activeSessionIds.has(id));

  await Promise.all(
    orphanedSessionIds.map((sessionId) => cleanupSessionNetwork(sessionId).catch(() => {})),
  );

  return orphanedSessionIds.length;
}

export async function reconcileNetworkConnections(): Promise<void> {
  const activeSessions = await findActiveSessionsForReconciliation();

  if (activeSessions.length === 0) {
    return;
  }

  console.log(`[Network] Reconciling network connections for ${activeSessions.length} sessions`);

  for (const session of activeSessions) {
    const networkName = formatNetworkName(session.id);

    const networkExists = await docker.raw
      .getNetwork(networkName)
      .inspect()
      .then(() => true)
      .catch(() => false);

    if (!networkExists) {
      continue;
    }

    if (config.browserContainerName) {
      try {
        await connectContainerToNetworkIfNotConnected(config.browserContainerName, networkName);
      } catch (error) {
        console.warn(`[Network] Failed to reconnect browser to network ${networkName}:`, error);
      }
    }

    if (config.opencodeContainerName) {
      try {
        await connectContainerToNetworkIfNotConnected(config.opencodeContainerName, networkName);
      } catch (error) {
        console.warn(`[Network] Failed to reconnect opencode to network ${networkName}:`, error);
      }
    }
  }

  console.log(`[Network] Network reconciliation complete`);
}
