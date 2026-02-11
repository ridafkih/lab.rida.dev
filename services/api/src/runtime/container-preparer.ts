import type { ContainerNode } from "@lab/sandbox-sdk";
import type { ContainerWithDependencies } from "../repositories/container-dependency.repository";
import { findEnvVarsByContainerIds } from "../repositories/container-env-var.repository";
import { findPortsByContainerIds } from "../repositories/container-port.repository";
import type { Sandbox } from "../types/dependencies";
import { initializeContainerWorkspace } from "./workspace";

export interface PreparedContainer {
  containerDefinition: ContainerWithDependencies;
  ports: { port: number }[];
  envVars: { key: string; value: string }[];
  containerWorkspace: string;
}

export function buildContainerNodes(
  containers: ContainerWithDependencies[]
): ContainerNode[] {
  return containers.map((container) => ({
    id: container.id,
    dependsOn: container.dependencies.map(
      (dependency) => dependency.dependsOnContainerId
    ),
  }));
}

export async function prepareAllContainerData(
  sessionId: string,
  definitions: ContainerWithDependencies[],
  sandbox: Sandbox
): Promise<PreparedContainer[]> {
  const containerIds = definitions.map((d) => d.id);

  const [portsMap, envVarsMap, workspaces] = await Promise.all([
    findPortsByContainerIds(containerIds),
    findEnvVarsByContainerIds(containerIds),
    Promise.all(
      definitions.map((definition) =>
        initializeContainerWorkspace(
          sessionId,
          definition.id,
          definition.image,
          sandbox
        )
      )
    ),
  ]);

  const result: PreparedContainer[] = [];
  for (const [index, definition] of definitions.entries()) {
    const containerWorkspace = workspaces[index];
    if (!containerWorkspace) {
      throw new Error(
        `Workspace initialization missing for container ${definition.id}`
      );
    }

    result.push({
      containerDefinition: definition,
      ports: portsMap.get(definition.id) ?? [],
      envVars: envVarsMap.get(definition.id) ?? [],
      containerWorkspace,
    });
  }

  return result;
}
