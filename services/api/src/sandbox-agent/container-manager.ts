import type { DockerClient } from "@lab/sandbox-docker";
import {
  findSessionById,
  updateSessionFields,
} from "../repositories/session.repository";
import { resolveWorkspacePathBySession } from "../shared/path-resolver";
import type { SidecarProvider } from "../types/sidecar";

const SANDBOX_AGENT_IMAGE = "lab-sandbox-agent:latest";
const WORKSPACES_VOLUME = "lab_session_workspaces";
const CONTAINER_LABEL = "lab.sandbox-agent";
const HEALTH_CHECK_INITIAL_INTERVAL_MS = 100;
const HEALTH_CHECK_MAX_INTERVAL_MS = 500;
const HEALTH_CHECK_TIMEOUT_MS = 15_000;

interface ContainerEntry {
  url: string;
  port: number;
  containerId: string;
}

export class SandboxAgentContainerManager implements SidecarProvider {
  private readonly cache = new Map<string, ContainerEntry>();
  private readonly docker: DockerClient;
  private readonly anthropicApiKey: string;

  constructor(docker: DockerClient, anthropicApiKey: string) {
    this.docker = docker;
    this.anthropicApiKey = anthropicApiKey;
  }

  async spawnForSession(sessionId: string): Promise<void> {
    if (this.cache.has(sessionId)) {
      return;
    }

    const workspacePath = await resolveWorkspacePathBySession(sessionId);
    await this.spawnWithWorkspace(sessionId, workspacePath);
  }

  async spawnWithWorkspace(
    labSessionId: string,
    workspacePath: string
  ): Promise<string> {
    const existing = this.cache.get(labSessionId);
    if (existing) {
      return existing.url;
    }

    const containerName = `lab-sa-${labSessionId.slice(0, 8)}`;

    const containerId = await this.docker.createContainer({
      image: SANDBOX_AGENT_IMAGE,
      name: containerName,
      platform: "linux/amd64",
      workdir: workspacePath,
      env: { ANTHROPIC_API_KEY: this.anthropicApiKey },
      ports: [{ container: 3000, host: 0 }],
      volumes: [{ source: WORKSPACES_VOLUME, target: "/workspaces" }],
      labels: {
        "com.docker.compose.project": `lab-session-${labSessionId.slice(0, 8)}`,
        [CONTAINER_LABEL]: labSessionId,
        "lab.session": labSessionId,
      },
    });

    await this.docker.startContainer(containerId);

    const info = await this.docker.inspectContainer(containerId);
    const port = info.ports[3000];
    if (!port) {
      throw new Error("Sandbox agent container has no mapped port for 3000");
    }
    const url = `http://host.docker.internal:${port}`;
    await this.waitForHealthy(url);

    this.cache.set(labSessionId, { url, port, containerId });

    await updateSessionFields(labSessionId, {
      sandboxAgentPort: port,
      sandboxAgentContainerId: containerId,
    });

    return url;
  }

  async getUrlForSession(labSessionId: string): Promise<string | null> {
    const cached = this.cache.get(labSessionId);
    if (cached) {
      return cached.url;
    }

    const session = await findSessionById(labSessionId);
    if (!session?.sandboxAgentPort) {
      return null;
    }

    const url = `http://host.docker.internal:${session.sandboxAgentPort}`;
    this.cache.set(labSessionId, {
      url,
      port: session.sandboxAgentPort,
      containerId: session.sandboxAgentContainerId ?? "",
    });

    return url;
  }

  async destroyForSession(labSessionId: string): Promise<void> {
    const containerId =
      this.cache.get(labSessionId)?.containerId ??
      (await findSessionById(labSessionId))?.sandboxAgentContainerId;

    this.cache.delete(labSessionId);

    if (!containerId) {
      return;
    }

    const exists = await this.docker.containerExists(containerId);
    if (!exists) {
      return;
    }
    await this.docker.removeContainer(containerId, true);
  }

  getFirstAvailableUrl(): string | null {
    const first = this.cache.values().next();
    if (first.done) {
      return null;
    }
    return first.value.url;
  }

  private async waitForHealthy(url: string): Promise<void> {
    const start = Date.now();
    let interval = HEALTH_CHECK_INITIAL_INTERVAL_MS;
    while (Date.now() - start < HEALTH_CHECK_TIMEOUT_MS) {
      try {
        const response = await fetch(`${url}/v1/agents`);
        if (response.ok) {
          return;
        }
      } catch {
        // Not ready yet
      }
      await new Promise((resolve) => setTimeout(resolve, interval));
      interval = Math.min(interval * 1.5, HEALTH_CHECK_MAX_INTERVAL_MS);
    }
    throw new Error(
      `Sandbox agent container did not become healthy within ${HEALTH_CHECK_TIMEOUT_MS}ms`
    );
  }
}
