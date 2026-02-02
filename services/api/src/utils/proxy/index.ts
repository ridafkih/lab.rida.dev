import { DockerClient } from "@lab/sandbox-docker";
import { CaddyProxyManager } from "./manager";
import { findActiveSessionsForReconciliation } from "../repositories/session.repository";
import { getSessionContainersForReconciliation } from "../repositories/container.repository";
import { formatNetworkName, formatUniqueHostname } from "../../types/session";

const { CADDY_ADMIN_URL, PROXY_BASE_DOMAIN, CADDY_CONTAINER_NAME } = process.env;

if (!CADDY_ADMIN_URL) throw new Error("CADDY_ADMIN_URL must be defined");
if (!PROXY_BASE_DOMAIN) throw new Error("PROXY_BASE_DOMAIN must be defined");
if (!CADDY_CONTAINER_NAME) throw new Error("CADDY_CONTAINER_NAME must be defined");

const docker = new DockerClient();

export const proxyManager = new CaddyProxyManager({
  docker,
  adminUrl: CADDY_ADMIN_URL,
  baseDomain: PROXY_BASE_DOMAIN,
  caddyContainerName: CADDY_CONTAINER_NAME,
});

let initialized = false;

async function reconcileRoutes(): Promise<void> {
  const activeSessions = await findActiveSessionsForReconciliation();

  for (const { id: sessionId } of activeSessions) {
    const containerData = await getSessionContainersForReconciliation(sessionId);
    if (containerData.length === 0) continue;

    // Group ports by containerId and check if Docker container is running
    const containerMap = new Map<string, { hostname: string; ports: Record<number, number> }>();

    for (const { containerId, dockerId, port } of containerData) {
      if (!dockerId) {
        console.warn(`[Reconcile] Skipping container ${containerId} - no docker_id`);
        continue;
      }

      try {
        const info = await docker.inspectContainer(dockerId);
        if (info.state !== "running") continue;
      } catch {
        // Container doesn't exist in Docker, skip
        continue;
      }

      if (!containerMap.has(containerId)) {
        containerMap.set(containerId, {
          hostname: formatUniqueHostname(sessionId, containerId),
          ports: {},
        });
      }
      const container = containerMap.get(containerId);
      if (container) {
        container.ports[port] = port;
      }
    }

    if (containerMap.size === 0) continue;

    const clusterContainers = Array.from(containerMap.entries()).map(
      ([containerId, { hostname, ports }]) => ({
        containerId,
        hostname,
        ports,
      }),
    );

    const networkName = formatNetworkName(sessionId);

    try {
      await proxyManager.registerCluster(sessionId, networkName, clusterContainers);
      console.log(`Reconciled routes for session ${sessionId}`);
    } catch (error) {
      console.warn(`Failed to reconcile routes for session ${sessionId}:`, error);
    }
  }
}

export async function ensureProxyInitialized(): Promise<void> {
  if (initialized) return;
  await proxyManager.initialize();
  await reconcileRoutes();
  initialized = true;
}

export function isProxyInitialized(): boolean {
  return initialized;
}

export async function ensureCaddyRoutesExist(): Promise<void> {
  if (!initialized) return;

  try {
    const config = (await proxyManager.getConfig()) as {
      apps?: { http?: { servers?: { srv0?: { routes?: unknown[] } } } };
    };
    const routes = config?.apps?.http?.servers?.srv0?.routes ?? [];

    if (routes.length === 0) {
      console.log("[Proxy] Caddy has no routes, running reconciliation...");
      await reconcileRoutes();
    }
  } catch (error) {
    console.warn("[Proxy] Failed to check Caddy routes:", error);
  }
}
