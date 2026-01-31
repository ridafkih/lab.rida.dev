import { db } from "@lab/database/client";
import { projects } from "@lab/database/schema/projects";
import { containers } from "@lab/database/schema/containers";
import { containerPorts } from "@lab/database/schema/container-ports";
import { eq } from "drizzle-orm";

export async function findAllProjects() {
  return db.select().from(projects);
}

export async function findAllProjectsWithContainers() {
  const allProjects = await db.select().from(projects);

  const allContainers = await db
    .select({
      id: containers.id,
      projectId: containers.projectId,
      image: containers.image,
      hostname: containers.hostname,
    })
    .from(containers);

  const allPorts = await db
    .select({
      containerId: containerPorts.containerId,
      port: containerPorts.port,
    })
    .from(containerPorts);

  const portsByContainerId = new Map<string, number[]>();
  for (const port of allPorts) {
    const existing = portsByContainerId.get(port.containerId) ?? [];
    existing.push(port.port);
    portsByContainerId.set(port.containerId, existing);
  }

  const containersByProjectId = new Map<
    string,
    { id: string; image: string; hostname: string | null; ports: number[] }[]
  >();
  for (const container of allContainers) {
    const existing = containersByProjectId.get(container.projectId) ?? [];
    existing.push({
      id: container.id,
      image: container.image,
      hostname: container.hostname,
      ports: portsByContainerId.get(container.id) ?? [],
    });
    containersByProjectId.set(container.projectId, existing);
  }

  return allProjects.map((project) => ({
    ...project,
    containers: containersByProjectId.get(project.id) ?? [],
  }));
}

export async function findProjectById(projectId: string) {
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId));
  return project ?? null;
}

export async function findProjectSummaries() {
  return db.select({ id: projects.id, name: projects.name }).from(projects);
}

export async function createProject(data: { name: string; systemPrompt?: string }) {
  const [project] = await db
    .insert(projects)
    .values({ name: data.name, systemPrompt: data.systemPrompt })
    .returning();
  return project;
}

export async function deleteProject(projectId: string) {
  await db.delete(projects).where(eq(projects.id, projectId));
}

export async function getProjectSystemPrompt(projectId: string) {
  const [project] = await db
    .select({ systemPrompt: projects.systemPrompt })
    .from(projects)
    .where(eq(projects.id, projectId));
  return project?.systemPrompt ?? null;
}
