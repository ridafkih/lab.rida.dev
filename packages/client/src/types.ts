export interface ContainerDependency {
  dependsOnContainerId: string;
  condition: string;
}

export interface ProjectContainer {
  id: string;
  image: string;
  hostname: string | null;
  isWorkspace: boolean;
  ports: number[];
  dependencies: ContainerDependency[];
}

export interface Project {
  id: string;
  name: string;
  description: string | null;
  systemPrompt: string | null;
  containers: ProjectContainer[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateProjectInput {
  name: string;
  description?: string;
  systemPrompt?: string;
}

export interface UpdateProjectInput {
  description?: string;
  systemPrompt?: string;
}

export interface Container {
  id: string;
  projectId: string;
  image: string;
  hostname: string | null;
  dependencies: ContainerDependency[];
  createdAt: string;
  updatedAt: string;
}

export interface DependsOnInput {
  containerId: string;
  condition?: string;
}

export interface CreateContainerInput {
  image: string;
  hostname?: string;
  ports?: number[];
  dependsOn?: (DependsOnInput | string)[];
}

interface SessionContainerInfo {
  id: string;
  name: string;
  image: string;
  status: string;
  state: string;
  ports: Record<string, number>;
}

export interface SessionContainer {
  id: string;
  sessionId: string;
  containerId: string;
  runtimeId: string;
  status: "starting" | "running" | "stopped";
  info: SessionContainerInfo | null;
  urls: string[];
}

export type SessionStatus =
  | "creating"
  | "loading"
  | "running"
  | "idle"
  | "complete";

export interface Session {
  id: string;
  projectId: string;
  title: string | null;
  sandboxSessionId: string | null;
  status: SessionStatus;
  containers?: SessionContainer[];
  createdAt: string;
  updatedAt: string;
}

export interface Model {
  modelId: string;
  name: string;
}

export interface OrchestrationInput {
  content: string;
  channelId?: string;
  modelId?: string;
}

export interface ApiKey {
  id: string;
  name: string;
  keyPrefix: string;
  lastUsedAt: string | null;
  createdAt: string;
}

export interface ApiKeyCreated extends ApiKey {
  key: string;
}

export interface OrchestrationResult {
  orchestrationId: string | null;
  sessionId: string;
  projectId: string;
  projectName: string | null;
}
