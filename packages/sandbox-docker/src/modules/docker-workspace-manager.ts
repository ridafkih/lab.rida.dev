import type {
  SandboxProvider,
  WorkspaceManager,
  WorkspaceManagerConfig,
} from "@lab/sandbox-sdk";
import type { WorkspaceUtilityContainer } from "./workspace-utility-container";

export class DockerWorkspaceManager implements WorkspaceManager {
  private readonly client: SandboxProvider;
  private readonly config: WorkspaceManagerConfig;
  private readonly utilityContainer: WorkspaceUtilityContainer;

  constructor(
    client: SandboxProvider,
    config: WorkspaceManagerConfig,
    utilityContainer: WorkspaceUtilityContainer
  ) {
    this.client = client;
    this.config = config;
    this.utilityContainer = utilityContainer;
  }

  async startWorkspace(workspacePath: string, image: string): Promise<string> {
    await this.ensureImageAvailable(image);
    const { workdir } = await this.client.getImageConfig(image);
    const hasWorkdir = workdir && workdir !== "/";

    if (hasWorkdir) {
      await this.populateFromImage(image, workspacePath, workdir);
    } else {
      await this.utilityContainer.exec(["mkdir", "-p", workspacePath]);
    }

    return workspacePath;
  }

  async removeWorkspace(workspacePath: string): Promise<void> {
    await this.utilityContainer.exec(["rm", "-rf", workspacePath]);
  }

  private async ensureImageAvailable(image: string): Promise<void> {
    const exists = await this.client.imageExists(image);
    if (!exists) {
      await this.client.pullImage(image);
    }
  }

  private async populateFromImage(
    image: string,
    workspacePath: string,
    workdir: string
  ): Promise<void> {
    const containerId = await this.client.createContainer({
      image,
      command: [
        "sh",
        "-c",
        `mkdir -p ${workspacePath} && cp -r ${workdir}/. ${workspacePath}/`,
      ],
      volumes: [
        {
          source: this.config.workspacesVolume,
          target: this.config.workspacesMount,
        },
      ],
    });

    await this.client.startContainer(containerId);
    await this.client.waitContainer(containerId);
    await this.client.removeContainer(containerId);
  }
}
