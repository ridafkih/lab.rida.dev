import type { SandboxAgentClient } from "../types/dependencies";
import { createSandboxAgentClient } from "./client";
import type { SandboxAgentContainerManager } from "./container-manager";

export class SandboxAgentClientResolver {
  private readonly containerManager: SandboxAgentContainerManager;

  constructor(containerManager: SandboxAgentContainerManager) {
    this.containerManager = containerManager;
  }

  async getClient(labSessionId: string): Promise<SandboxAgentClient> {
    const url = await this.containerManager.getUrlForSession(labSessionId);
    if (!url) {
      throw new Error(`No sandbox-agent container for session ${labSessionId}`);
    }
    return createSandboxAgentClient(url);
  }

  getAnyClient(): SandboxAgentClient {
    const url = this.containerManager.getFirstAvailableUrl();
    if (!url) {
      throw new Error("No sandbox-agent containers available");
    }
    return createSandboxAgentClient(url);
  }
}
