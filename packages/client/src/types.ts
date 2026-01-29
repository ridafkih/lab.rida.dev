export interface Project {
  id: string;
  name: string;
  systemPrompt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateProjectInput {
  name: string;
  systemPrompt?: string;
}

export interface Container {
  id: string;
  projectId: string;
  image: string;
  hostname: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateContainerInput {
  image: string;
  hostname?: string;
}
