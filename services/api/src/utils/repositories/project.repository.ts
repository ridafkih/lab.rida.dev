import { db } from "@lab/database/client";
import { projects } from "@lab/database/schema/projects";
import { containers } from "@lab/database/schema/containers";
import { containerPorts } from "@lab/database/schema/container-ports";
import { containerDependencies } from "@lab/database/schema/container-dependencies";
import { eq, inArray } from "drizzle-orm";

export async function findAllProjects() {
  return db.select().from(projects);
}

type ContainerWithDetails = {
  id: string;
  image: string;
  hostname: string | null;
  isWorkspace: boolean;
  ports: number[];
  dependencies: { dependsOnContainerId: string; condition: string }[];
};

export async function findAllProjectsWithContainers() {
  const allProjects = await db.select().from(projects);

  const allContainers = await db
    .select({
      id: containers.id,
      projectId: containers.projectId,
      image: containers.image,
      hostname: containers.hostname,
      isWorkspace: containers.isWorkspace,
    })
    .from(containers);

  const containerIds = allContainers.map((container) => container.id);

  const allPorts =
    containerIds.length > 0
      ? await db
          .select({
            containerId: containerPorts.containerId,
            port: containerPorts.port,
          })
          .from(containerPorts)
          .where(inArray(containerPorts.containerId, containerIds))
      : [];

  const allDependencies =
    containerIds.length > 0
      ? await db
          .select({
            containerId: containerDependencies.containerId,
            dependsOnContainerId: containerDependencies.dependsOnContainerId,
            condition: containerDependencies.condition,
          })
          .from(containerDependencies)
          .where(inArray(containerDependencies.containerId, containerIds))
      : [];

  const portsByContainerId = new Map<string, number[]>();
  for (const port of allPorts) {
    const existing = portsByContainerId.get(port.containerId) ?? [];
    existing.push(port.port);
    portsByContainerId.set(port.containerId, existing);
  }

  const dependenciesByContainerId = new Map<
    string,
    { dependsOnContainerId: string; condition: string }[]
  >();
  for (const dependency of allDependencies) {
    const existing = dependenciesByContainerId.get(dependency.containerId) ?? [];
    existing.push({
      dependsOnContainerId: dependency.dependsOnContainerId,
      condition: dependency.condition,
    });
    dependenciesByContainerId.set(dependency.containerId, existing);
  }

  const containersByProjectId = new Map<string, ContainerWithDetails[]>();
  for (const container of allContainers) {
    const existing = containersByProjectId.get(container.projectId) ?? [];
    existing.push({
      id: container.id,
      image: container.image,
      hostname: container.hostname,
      isWorkspace: container.isWorkspace,
      ports: portsByContainerId.get(container.id) ?? [],
      dependencies: dependenciesByContainerId.get(container.id) ?? [],
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

export async function createProject(data: {
  name: string;
  description?: string;
  systemPrompt?: string;
}) {
  const [project] = await db
    .insert(projects)
    .values({
      name: data.name,
      description: data.description,
      systemPrompt: data.systemPrompt,
    })
    .returning();
  return project;
}

export async function deleteProject(projectId: string) {
  await db.delete(projects).where(eq(projects.id, projectId));
}

export async function updateProject(
  projectId: string,
  data: { description?: string; systemPrompt?: string },
) {
  const [project] = await db
    .update(projects)
    .set({
      ...data,
      updatedAt: new Date(),
    })
    .where(eq(projects.id, projectId))
    .returning();
  return project ?? null;
}

export async function getProjectSystemPrompt(projectId: string) {
  const [project] = await db
    .select({ systemPrompt: projects.systemPrompt })
    .from(projects)
    .where(eq(projects.id, projectId));
  return project?.systemPrompt ?? null;
}
