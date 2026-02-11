import type { ExecResult } from "@lab/sandbox-sdk";
import type { DockerContainerManager } from "./docker-container-manager";
import type { DockerImageManager } from "./docker-image-manager";
import type { ExecOperations } from "./exec-operations";

const UTILITY_CONTAINER_NAME = "lab-workspace-utility";
const UTILITY_IMAGE = "alpine:3.21";

export class WorkspaceUtilityContainer {
  private readonly containerManager: DockerContainerManager;
  private readonly imageManager: DockerImageManager;
  private readonly execOps: ExecOperations;
  private readonly workspacesVolume: string;
  private readonly workspacesMount: string;
  private containerId: string | null = null;
  private initializing: Promise<string> | null = null;

  constructor(
    containerManager: DockerContainerManager,
    imageManager: DockerImageManager,
    execOps: ExecOperations,
    workspacesVolume: string,
    workspacesMount: string
  ) {
    this.containerManager = containerManager;
    this.imageManager = imageManager;
    this.execOps = execOps;
    this.workspacesVolume = workspacesVolume;
    this.workspacesMount = workspacesMount;
  }

  async exec(command: string[]): Promise<ExecResult> {
    const id = await this.ensureRunning();
    return this.execOps.exec(id, { command });
  }

  private async ensureRunning(): Promise<string> {
    if (this.containerId) {
      const exists = await this.containerManager.containerExists(
        this.containerId
      );
      if (exists) {
        return this.containerId;
      }
      this.containerId = null;
    }

    if (this.initializing) {
      return this.initializing;
    }

    this.initializing = this.createAndStart();
    try {
      const id = await this.initializing;
      this.containerId = id;
      return id;
    } finally {
      this.initializing = null;
    }
  }

  private async createAndStart(): Promise<string> {
    const existing = await this.findExisting();
    if (existing) {
      return existing;
    }

    await this.ensureImageAvailable();

    const id = await this.containerManager.createContainer({
      image: UTILITY_IMAGE,
      name: UTILITY_CONTAINER_NAME,
      command: ["sleep", "infinity"],
      volumes: [
        { source: this.workspacesVolume, target: this.workspacesMount },
      ],
      restartPolicy: { name: "unless-stopped" },
    });

    await this.containerManager.startContainer(id);
    return id;
  }

  private async findExisting(): Promise<string | null> {
    try {
      const info = await this.containerManager.inspectContainer(
        UTILITY_CONTAINER_NAME
      );
      if (info.state === "running") {
        return info.id;
      }
      if (info.state === "exited" || info.state === "created") {
        await this.containerManager.startContainer(info.id);
        return info.id;
      }
      await this.containerManager
        .removeContainer(info.id, true)
        .catch(() => undefined);
      return null;
    } catch {
      return null;
    }
  }

  private async ensureImageAvailable(): Promise<void> {
    const exists = await this.imageManager.imageExists(UTILITY_IMAGE);
    if (!exists) {
      await this.imageManager.pullImage(UTILITY_IMAGE);
    }
  }

  async destroy(): Promise<void> {
    if (this.containerId) {
      await this.containerManager
        .removeContainer(this.containerId, true)
        .catch(() => undefined);
      this.containerId = null;
    }
  }
}
