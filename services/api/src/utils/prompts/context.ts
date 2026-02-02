import type { PromptContext, ServiceRoute } from "../../types/prompt";
import { config } from "../../config/environment";

export interface ContainerInfo {
  hostname: string;
  port: number;
}

export interface CreatePromptContextParams {
  sessionId: string;
  projectId: string;
  containers: ContainerInfo[];
  projectSystemPrompt: string | null;
}

export function createPromptContext(params: CreatePromptContextParams): PromptContext {
  const serviceRoutes: ServiceRoute[] = params.containers.map((container) => ({
    port: container.port,
    url: `http://${container.hostname}.${config.proxyBaseDomain}/`,
  }));

  return {
    sessionId: params.sessionId,
    projectId: params.projectId,
    serviceRoutes,
    projectSystemPrompt: params.projectSystemPrompt,
  };
}
