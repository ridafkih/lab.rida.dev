import { db } from "@lab/database/client";
import { containers } from "@lab/database/schema/containers";
import { containerEnvVars } from "@lab/database/schema/container-env-vars";
import { containerPorts } from "@lab/database/schema/container-ports";
import { sessionContainers } from "@lab/database/schema/session-containers";
import { sessions } from "@lab/database/schema/sessions";
import { eq, and } from "drizzle-orm";
import { DockerClient } from "@lab/sandbox-docker";
import { proxyManager, isProxyInitialized, ensureProxyInitialized } from "./proxy";
import { publisher } from "./publisher";
import { subscribeToBrowserSession, browserStateManager } from "./browser";

const docker = new DockerClient();
const WORKSPACES_VOLUME = "lab_session_workspaces";
const WORKSPACES_HOST_PATH = "/var/lib/docker/volumes/lab_session_workspaces/_data";

const BROWSER_SOCKET_DIR = "/tmp/agent-browser-socket";
const BROWSER_SOCKET_VOLUME = process.env.BROWSER_SOCKET_VOLUME ?? "lab_browser_sockets";

export async function initializeSessionContainers(
  sessionId: string,
  projectId: string,
): Promise<void> {
  const containerDefinitions = await db
    .select()
    .from(containers)
    .where(eq(containers.projectId, projectId));

  const networkName = `lab-${sessionId}`;
  const dockerIds: string[] = [];
  const clusterContainers: {
    containerId: string;
    hostname: string;
    ports: Record<number, number>;
  }[] = [];

  try {
    await docker.createNetwork(networkName, { labels: { "lab.session": sessionId } });

    await subscribeToBrowserSession(sessionId);
    publisher.publishSnapshot(
      "sessionBrowserStream",
      { uuid: sessionId },
      {
        desiredState: "running",
        actualState: "starting",
      },
    );

    for (const containerDefinition of containerDefinitions) {
      const ports = await db
        .select()
        .from(containerPorts)
        .where(eq(containerPorts.containerId, containerDefinition.id));

      const envVars = await db
        .select()
        .from(containerEnvVars)
        .where(eq(containerEnvVars.containerId, containerDefinition.id));

      const imageExists = await docker.imageExists(containerDefinition.image);
      if (!imageExists) {
        await docker.pullImage(containerDefinition.image);
      }

      const { workdir: imageWorkdir } = await docker.getImageConfig(containerDefinition.image);
      const containerWorkspace = `/workspaces/${sessionId}/${containerDefinition.id}`;

      const initCommand =
        imageWorkdir && imageWorkdir !== "/"
          ? `mkdir -p ${containerWorkspace} && cp -r ${imageWorkdir}/. ${containerWorkspace}/`
          : `mkdir -p ${containerWorkspace}`;

      const initId = await docker.createContainer({
        image: containerDefinition.image,
        command: ["sh", "-c", initCommand],
        volumes: [{ source: WORKSPACES_VOLUME, target: "/workspaces" }],
      });
      await docker.startContainer(initId);
      await docker.waitContainer(initId);
      await docker.removeContainer(initId);

      const env: Record<string, string> = {};
      for (const envVar of envVars) {
        env[envVar.key] = envVar.value;
      }

      const serviceHostname = containerDefinition.hostname ?? containerDefinition.id;
      const uniqueHostname = `s-${sessionId.slice(0, 8)}-${containerDefinition.id.slice(0, 8)}`;

      const projectName = `lab-${sessionId}`;
      const containerName = `${projectName}-${containerDefinition.id}`;

      const containerVolumes = [
        { source: WORKSPACES_HOST_PATH, target: "/workspaces" },
        { source: BROWSER_SOCKET_VOLUME, target: BROWSER_SOCKET_DIR },
      ];
      env.AGENT_BROWSER_SOCKET_DIR = BROWSER_SOCKET_DIR;
      env.AGENT_BROWSER_SESSION = sessionId;

      const dockerId = await docker.createContainer({
        name: containerName,
        image: containerDefinition.image,
        hostname: uniqueHostname,
        networkMode: networkName,
        workdir: containerWorkspace,
        env: Object.keys(env).length > 0 ? env : undefined,
        ports: ports.map(({ port }) => ({ container: port, host: undefined })),
        volumes: containerVolumes,
        labels: {
          "com.docker.compose.project": projectName,
          "com.docker.compose.service": serviceHostname,
          "lab.session": sessionId,
          "lab.project": projectId,
          "lab.container": containerDefinition.id,
        },
      });

      dockerIds.push(dockerId);

      await db
        .update(sessionContainers)
        .set({ dockerId })
        .where(
          and(
            eq(sessionContainers.sessionId, sessionId),
            eq(sessionContainers.containerId, containerDefinition.id),
          ),
        );

      await docker.startContainer(dockerId);

      const portMap: Record<number, number> = {};
      for (const { port } of ports) {
        portMap[port] = port;
      }

      if (Object.keys(portMap).length > 0) {
        clusterContainers.push({
          containerId: containerDefinition.id,
          hostname: uniqueHostname,
          ports: portMap,
        });
      }
    }

    await ensureProxyInitialized();
    if (isProxyInitialized() && clusterContainers.length > 0) {
      await proxyManager.registerCluster(sessionId, networkName, clusterContainers);
    }
  } catch (error) {
    console.error(`Failed to initialize session ${sessionId}:`, error);

    await db
      .update(sessionContainers)
      .set({ status: "error" })
      .where(eq(sessionContainers.sessionId, sessionId));

    const errorContainers = await db
      .select({ id: sessionContainers.id })
      .from(sessionContainers)
      .where(eq(sessionContainers.sessionId, sessionId));

    for (const container of errorContainers) {
      publisher.publishDelta(
        "sessionContainers",
        { uuid: sessionId },
        {
          type: "update",
          container: {
            id: container.id,
            status: "error",
          },
        },
      );
    }

    await Promise.all(
      dockerIds.map((dockerId) =>
        docker
          .stopContainer(dockerId)
          .then(() => docker.removeContainer(dockerId))
          .catch((error) => console.error(`Failed to cleanup container ${dockerId}:`, error)),
      ),
    );

    await docker
      .removeNetwork(networkName)
      .catch((error) => console.error(`Failed to cleanup network ${networkName}:`, error));

    await browserStateManager.unsubscribe(sessionId);

    await db.delete(sessions).where(eq(sessions.id, sessionId));

    publisher.publishDelta("sessions", {
      type: "remove",
      session: {
        id: sessionId,
        projectId,
        title: sessionId.slice(0, 8),
      },
    });
  }
}
