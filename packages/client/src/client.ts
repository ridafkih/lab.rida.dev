import type {
  Project,
  CreateProjectInput,
  UpdateProjectInput,
  Container,
  CreateContainerInput,
  Session,
  Model,
  OrchestrationInput,
  OrchestrationResult,
} from "./types";

export interface ClientConfig {
  baseUrl: string;
}

export function createClient(config: ClientConfig) {
  const { baseUrl } = config;

  async function request<T>(path: string, options?: RequestInit): Promise<T> {
    const response = await fetch(`${baseUrl}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options?.headers,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(error || response.statusText);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return response.json();
  }

  return {
    projects: {
      list: () => request<Project[]>("/projects"),

      get: (projectId: string) => request<Project>(`/projects/${projectId}`),

      create: (input: CreateProjectInput) =>
        request<Project>("/projects", {
          method: "POST",
          body: JSON.stringify(input),
        }),

      update: (projectId: string, input: UpdateProjectInput) =>
        request<Project>(`/projects/${projectId}`, {
          method: "PATCH",
          body: JSON.stringify(input),
        }),

      delete: (projectId: string) =>
        request<void>(`/projects/${projectId}`, {
          method: "DELETE",
        }),
    },

    containers: {
      list: (projectId: string) => request<Container[]>(`/projects/${projectId}/containers`),

      create: (projectId: string, input: CreateContainerInput) =>
        request<Container>(`/projects/${projectId}/containers`, {
          method: "POST",
          body: JSON.stringify(input),
        }),

      setWorkspace: (projectId: string, containerId: string, isWorkspace: boolean) =>
        request<void>(`/projects/${projectId}/containers/${containerId}`, {
          method: "PATCH",
          body: JSON.stringify({ isWorkspace }),
        }),
    },

    sessions: {
      list: (projectId: string) => request<Session[]>(`/projects/${projectId}/sessions`),

      get: (sessionId: string) => request<Session>(`/sessions/${sessionId}`),

      create: (projectId: string, data?: { title?: string; initialMessage?: string }) =>
        request<Session>(`/projects/${projectId}/sessions`, {
          method: "POST",
          body: JSON.stringify(data ?? {}),
        }),

      update: (sessionId: string, data: { opencodeSessionId?: string; title?: string }) =>
        request<Session>(`/sessions/${sessionId}`, {
          method: "PATCH",
          body: JSON.stringify(data),
        }),

      delete: (sessionId: string) =>
        request<void>(`/sessions/${sessionId}`, {
          method: "DELETE",
        }),
    },

    models: {
      list: () => request<{ models: Model[] }>("/models"),
    },

    orchestrate: (input: OrchestrationInput) =>
      request<OrchestrationResult>("/orchestrate", {
        method: "POST",
        body: JSON.stringify(input),
      }),
  };
}

export type Client = ReturnType<typeof createClient>;
