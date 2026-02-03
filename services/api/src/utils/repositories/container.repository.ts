import { db } from "@lab/database/client";
import { containers, type Container } from "@lab/database/schema/containers";
import { containerPorts, type ContainerPort } from "@lab/database/schema/container-ports";
import { containerEnvVars, type ContainerEnvVar } from "@lab/database/schema/container-env-vars";
import {
  containerDependencies,
  type ContainerDependency,
} from "@lab/database/schema/container-dependencies";
import { sessionContainers, type SessionContainer } from "@lab/database/schema/session-containers";
import { eq, and, asc, inArray } from "drizzle-orm";
import type { ContainerStatus } from "../../types/container";

export async function findContainersByProjectId(projectId: string): Promise<Container[]> {
  return db.select().from(containers).where(eq(containers.projectId, projectId));
}

export async function createContainer(data: {
  projectId: string;
  image: string;
  hostname?: string;
}): Promise<Container> {
  const [container] = await db.insert(containers).values(data).returning();
  if (!container) throw new Error("Failed to create container");
  return container;
}

export async function createContainerPorts(containerId: string, ports: number[]): Promise<void> {
  if (ports.length === 0) return;
  await db.insert(containerPorts).values(ports.map((port) => ({ containerId, port })));
}

export async function createSessionContainer(data: {
  sessionId: string;
  containerId: string;
  dockerId: string;
  status: string;
}): Promise<SessionContainer> {
  const [sessionContainer] = await db.insert(sessionContainers).values(data).returning();
  if (!sessionContainer) throw new Error("Failed to create session container");
  return sessionContainer;
}

export async function findPortsByContainerId(containerId: string): Promise<ContainerPort[]> {
  return db.select().from(containerPorts).where(eq(containerPorts.containerId, containerId));
}

export async function findEnvVarsByContainerId(containerId: string): Promise<ContainerEnvVar[]> {
  return db.select().from(containerEnvVars).where(eq(containerEnvVars.containerId, containerId));
}

export async function findSessionContainersBySessionId(
  sessionId: string,
): Promise<SessionContainer[]> {
  return db.select().from(sessionContainers).where(eq(sessionContainers.sessionId, sessionId));
}

export async function findAllRunningSessionContainers(): Promise<
  {
    id: string;
    sessionId: string;
    dockerId: string;
    hostname: string;
  }[]
> {
  const rows = await db
    .select({
      id: sessionContainers.id,
      sessionId: sessionContainers.sessionId,
      dockerId: sessionContainers.dockerId,
      hostname: containers.hostname,
    })
    .from(sessionContainers)
    .innerJoin(containers, eq(sessionContainers.containerId, containers.id))
    .where(eq(sessionContainers.status, "running"));

  return rows.map((row) => ({
    id: row.id,
    sessionId: row.sessionId,
    dockerId: row.dockerId,
    hostname: row.hostname ?? row.id,
  }));
}

export async function findAllActiveSessionContainers(): Promise<
  {
    id: string;
    sessionId: string;
    dockerId: string;
    status: string;
  }[]
> {
  return db
    .select({
      id: sessionContainers.id,
      sessionId: sessionContainers.sessionId,
      dockerId: sessionContainers.dockerId,
      status: sessionContainers.status,
    })
    .from(sessionContainers)
    .where(inArray(sessionContainers.status, ["running", "starting"]));
}

export async function findSessionContainerByDockerId(
  dockerId: string,
): Promise<{ id: string } | null> {
  const [row] = await db
    .select({ id: sessionContainers.id })
    .from(sessionContainers)
    .where(eq(sessionContainers.dockerId, dockerId));
  return row ?? null;
}

export async function findSessionContainerDetailsByDockerId(dockerId: string): Promise<{
  id: string;
  sessionId: string;
  containerId: string;
  hostname: string;
} | null> {
  const [row] = await db
    .select({
      id: sessionContainers.id,
      sessionId: sessionContainers.sessionId,
      containerId: sessionContainers.containerId,
      hostname: containers.hostname,
    })
    .from(sessionContainers)
    .innerJoin(containers, eq(sessionContainers.containerId, containers.id))
    .where(eq(sessionContainers.dockerId, dockerId));

  if (!row) return null;

  return {
    id: row.id,
    sessionId: row.sessionId,
    containerId: row.containerId,
    hostname: row.hostname ?? row.containerId,
  };
}

export async function updateSessionContainerDockerId(
  sessionId: string,
  containerId: string,
  dockerId: string,
): Promise<void> {
  await db
    .update(sessionContainers)
    .set({ dockerId })
    .where(
      and(
        eq(sessionContainers.sessionId, sessionId),
        eq(sessionContainers.containerId, containerId),
      ),
    );
}

export async function updateSessionContainerStatus(
  id: string,
  status: ContainerStatus,
): Promise<void> {
  await db.update(sessionContainers).set({ status }).where(eq(sessionContainers.id, id));
}

export async function updateSessionContainersStatusBySessionId(
  sessionId: string,
  status: ContainerStatus,
): Promise<{ id: string }[]> {
  await db
    .update(sessionContainers)
    .set({ status })
    .where(eq(sessionContainers.sessionId, sessionId));

  return db
    .select({ id: sessionContainers.id })
    .from(sessionContainers)
    .where(eq(sessionContainers.sessionId, sessionId));
}

export async function getFirstExposedPort(sessionId: string): Promise<number | null> {
  const result = await db
    .select({ port: containerPorts.port })
    .from(sessionContainers)
    .innerJoin(containerPorts, eq(containerPorts.containerId, sessionContainers.containerId))
    .where(eq(sessionContainers.sessionId, sessionId))
    .orderBy(asc(containerPorts.port))
    .limit(1);

  return result[0]?.port ?? null;
}

export async function getFirstExposedService(
  sessionId: string,
): Promise<{ hostname: string; port: number } | null> {
  const result = await db
    .select({
      port: containerPorts.port,
    })
    .from(sessionContainers)
    .innerJoin(containerPorts, eq(containerPorts.containerId, sessionContainers.containerId))
    .where(eq(sessionContainers.sessionId, sessionId))
    .orderBy(asc(containerPorts.port))
    .limit(1);

  if (!result[0]) return null;

  const hostname = `${sessionId}--${result[0].port}`;
  return { hostname, port: result[0].port };
}

export async function getSessionContainersWithDetails(sessionId: string): Promise<
  {
    id: string;
    containerId: string;
    status: string;
    hostname: string | null;
    image: string;
  }[]
> {
  return db
    .select({
      id: sessionContainers.id,
      containerId: sessionContainers.containerId,
      status: sessionContainers.status,
      hostname: containers.hostname,
      image: containers.image,
    })
    .from(sessionContainers)
    .innerJoin(containers, eq(sessionContainers.containerId, containers.id))
    .where(eq(sessionContainers.sessionId, sessionId));
}

export interface SessionService {
  containerId: string;
  dockerId: string;
  image: string;
  status: string;
  ports: number[];
}

export async function getSessionServices(sessionId: string): Promise<SessionService[]> {
  const containerRows = await db
    .select({
      containerId: sessionContainers.containerId,
      dockerId: sessionContainers.dockerId,
      status: sessionContainers.status,
      hostname: containers.hostname,
      image: containers.image,
    })
    .from(sessionContainers)
    .innerJoin(containers, eq(sessionContainers.containerId, containers.id))
    .where(eq(sessionContainers.sessionId, sessionId));

  const containerIds = containerRows.map((row) => row.containerId);
  if (containerIds.length === 0) return [];

  const portRows = await db
    .select({
      containerId: containerPorts.containerId,
      port: containerPorts.port,
    })
    .from(containerPorts)
    .where(inArray(containerPorts.containerId, containerIds))
    .orderBy(asc(containerPorts.port));

  const portsByContainerId = new Map<string, number[]>();
  for (const row of portRows) {
    const ports = portsByContainerId.get(row.containerId) ?? [];
    ports.push(row.port);
    portsByContainerId.set(row.containerId, ports);
  }

  return containerRows.map((row) => ({
    containerId: row.containerId,
    dockerId: row.dockerId,
    image: row.image,
    status: row.status,
    ports: portsByContainerId.get(row.containerId) ?? [],
  }));
}

export async function getSessionContainersWithPorts(sessionId: string): Promise<
  {
    hostname: string;
    port: number;
  }[]
> {
  const result = await db
    .select({
      port: containerPorts.port,
    })
    .from(sessionContainers)
    .innerJoin(containerPorts, eq(containerPorts.containerId, sessionContainers.containerId))
    .where(eq(sessionContainers.sessionId, sessionId))
    .orderBy(asc(containerPorts.port));

  return result.map((row) => ({
    hostname: `${sessionId}--${row.port}`,
    port: row.port,
  }));
}

export async function getSessionContainersForReconciliation(sessionId: string): Promise<
  {
    containerId: string;
    dockerId: string;
    port: number;
  }[]
> {
  return db
    .select({
      containerId: sessionContainers.containerId,
      dockerId: sessionContainers.dockerId,
      port: containerPorts.port,
    })
    .from(sessionContainers)
    .innerJoin(containerPorts, eq(containerPorts.containerId, sessionContainers.containerId))
    .where(eq(sessionContainers.sessionId, sessionId))
    .orderBy(asc(containerPorts.port));
}

export async function findDependenciesByContainerId(
  containerId: string,
): Promise<ContainerDependency[]> {
  return db
    .select()
    .from(containerDependencies)
    .where(eq(containerDependencies.containerId, containerId));
}

export interface ContainerWithDependencies extends Container {
  dependencies: { dependsOnContainerId: string; condition: string }[];
}

async function fetchDependenciesForContainers(
  containerIds: string[],
): Promise<ContainerDependency[]> {
  return db
    .select()
    .from(containerDependencies)
    .where(inArray(containerDependencies.containerId, containerIds));
}

function groupDependenciesByContainerId(
  dependencies: ContainerDependency[],
): Map<string, { dependsOnContainerId: string; condition: string }[]> {
  const grouped = new Map<string, { dependsOnContainerId: string; condition: string }[]>();

  for (const dependency of dependencies) {
    const existing = grouped.get(dependency.containerId) || [];
    grouped.set(dependency.containerId, [
      ...existing,
      {
        dependsOnContainerId: dependency.dependsOnContainerId,
        condition: dependency.condition,
      },
    ]);
  }

  return grouped;
}

function attachDependenciesToContainers(
  projectContainers: Container[],
  dependenciesByContainerId: Map<string, { dependsOnContainerId: string; condition: string }[]>,
): ContainerWithDependencies[] {
  return projectContainers.map((container) => ({
    ...container,
    dependencies: dependenciesByContainerId.get(container.id) || [],
  }));
}

export async function findContainersWithDependencies(
  projectId: string,
): Promise<ContainerWithDependencies[]> {
  const projectContainers = await findContainersByProjectId(projectId);

  if (projectContainers.length === 0) return [];

  const containerIds = projectContainers.map((container) => container.id);
  const dependencies = await fetchDependenciesForContainers(containerIds);
  const dependenciesByContainerId = groupDependenciesByContainerId(dependencies);

  return attachDependenciesToContainers(projectContainers, dependenciesByContainerId);
}

function buildDependencyRecords(
  containerId: string,
  dependencies: { dependsOnContainerId: string; condition?: string }[],
): { containerId: string; dependsOnContainerId: string; condition: string }[] {
  return dependencies.map((dependency) => ({
    containerId,
    dependsOnContainerId: dependency.dependsOnContainerId,
    condition: dependency.condition || "service_started",
  }));
}

export async function createContainerDependencies(
  containerId: string,
  dependencies: { dependsOnContainerId: string; condition?: string }[],
): Promise<void> {
  if (dependencies.length === 0) return;

  const records = buildDependencyRecords(containerId, dependencies);
  await db.insert(containerDependencies).values(records);
}

export async function deleteContainerDependencies(containerId: string): Promise<void> {
  await db.delete(containerDependencies).where(eq(containerDependencies.containerId, containerId));
}

function checkSelfDependency(containerId: string, dependsOnIds: string[]): string | null {
  if (dependsOnIds.includes(containerId)) {
    return "Container cannot depend on itself";
  }
  return null;
}

function findMissingDependencies(
  dependsOnIds: string[],
  projectContainerIds: Set<string>,
): string[] {
  const errors: string[] = [];
  for (const depId of dependsOnIds) {
    if (!projectContainerIds.has(depId)) {
      errors.push(`Dependency container ${depId} does not exist in project`);
    }
  }
  return errors;
}

export async function validateDependencies(
  projectId: string,
  containerId: string,
  dependsOnIds: string[],
): Promise<{ valid: boolean; errors: string[] }> {
  const errors: string[] = [];

  const selfDependencyError = checkSelfDependency(containerId, dependsOnIds);
  if (selfDependencyError) {
    errors.push(selfDependencyError);
  }

  if (dependsOnIds.length === 0) {
    return { valid: errors.length === 0, errors };
  }

  const projectContainers = await findContainersByProjectId(projectId);
  const projectContainerIds = new Set(projectContainers.map((container) => container.id));
  const missingErrors = findMissingDependencies(dependsOnIds, projectContainerIds);
  errors.push(...missingErrors);

  return { valid: errors.length === 0, errors };
}

export async function getWorkspaceContainerId(sessionId: string): Promise<string | null> {
  const result = await db
    .select({ containerId: sessionContainers.containerId })
    .from(sessionContainers)
    .innerJoin(containers, eq(sessionContainers.containerId, containers.id))
    .where(and(eq(sessionContainers.sessionId, sessionId), eq(containers.isWorkspace, true)))
    .limit(1);

  return result[0]?.containerId ?? null;
}

export async function getWorkspaceContainerDockerId(sessionId: string): Promise<{
  dockerId: string;
  containerId: string;
} | null> {
  const result = await db
    .select({
      dockerId: sessionContainers.dockerId,
      containerId: sessionContainers.containerId,
    })
    .from(sessionContainers)
    .innerJoin(containers, eq(sessionContainers.containerId, containers.id))
    .where(and(eq(sessionContainers.sessionId, sessionId), eq(containers.isWorkspace, true)))
    .limit(1);

  return result[0] ?? null;
}

export async function getWorkspaceContainerIdByProjectId(
  projectId: string,
): Promise<string | null> {
  const result = await db
    .select({ id: containers.id })
    .from(containers)
    .where(and(eq(containers.projectId, projectId), eq(containers.isWorkspace, true)))
    .limit(1);

  return result[0]?.id ?? null;
}

export async function setWorkspaceContainer(projectId: string, containerId: string): Promise<void> {
  await db
    .update(containers)
    .set({ isWorkspace: false })
    .where(eq(containers.projectId, projectId));

  await db
    .update(containers)
    .set({ isWorkspace: true })
    .where(and(eq(containers.id, containerId), eq(containers.projectId, projectId)));
}

export async function clearWorkspaceContainer(projectId: string): Promise<void> {
  await db
    .update(containers)
    .set({ isWorkspace: false })
    .where(eq(containers.projectId, projectId));
}
