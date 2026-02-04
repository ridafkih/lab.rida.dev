import { docker } from "../../clients/docker";
import { config } from "../../config/environment";
import { formatNetworkName } from "../../types/session";
import { findSessionContainersBySessionId } from "../repositories/container.repository";
import { deleteSession, findSessionById } from "../repositories/session.repository";
import { proxyManager, isProxyInitialized } from "../proxy";
import { publisher } from "../../clients/publisher";
import type { BrowserService } from "../browser/browser-service";

export async function cleanupSession(
  sessionId: string,
  browserService: BrowserService,
): Promise<void> {
  const session = await findSessionById(sessionId);
  if (!session) return;

  const containers = await findSessionContainersBySessionId(sessionId);
  const networkName = formatNetworkName(sessionId);

  await Promise.all(
    containers
      .filter((container) => container.dockerId)
      .map(async (container) => {
        await docker.stopContainer(container.dockerId);
        await docker.removeContainer(container.dockerId);
      }),
  );

  await browserService.forceStopBrowser(sessionId);

  if (isProxyInitialized()) {
    try {
      await proxyManager.unregisterCluster(sessionId);
    } catch (error) {
      // Cluster may not be registered if initialization failed
      console.warn(`Failed to unregister proxy cluster for session ${sessionId}:`, error);
    }
  }

  const containersToDisconnect = [
    config.browserContainerName,
    config.opencodeContainerName,
    config.proxyContainerName,
  ].filter(Boolean) as string[];

  await Promise.all(
    containersToDisconnect.map(async (containerName) => {
      try {
        await docker.disconnectFromNetwork(containerName, networkName);
      } catch (error) {
        if (!String(error).includes("is not connected to network")) {
          console.warn(`Failed to disconnect ${containerName} from network ${networkName}:`, error);
        }
      }
    }),
  );

  await docker.removeNetwork(networkName);
  await deleteSession(sessionId);

  publisher.publishDelta("sessions", {
    type: "remove",
    session: {
      id: session.id,
      projectId: session.projectId,
      title: session.title,
    },
  });
}
