import { db } from "@lab/database/client";
import {
  type ContainerEnvVar,
  containerEnvVars,
} from "@lab/database/schema/container-env-vars";
import { eq, inArray } from "drizzle-orm";

export function findEnvVarsByContainerId(
  containerId: string
): Promise<ContainerEnvVar[]> {
  return db
    .select()
    .from(containerEnvVars)
    .where(eq(containerEnvVars.containerId, containerId));
}

export async function findEnvVarsByContainerIds(
  containerIds: string[]
): Promise<Map<string, ContainerEnvVar[]>> {
  if (containerIds.length === 0) {
    return new Map();
  }

  const rows = await db
    .select()
    .from(containerEnvVars)
    .where(inArray(containerEnvVars.containerId, containerIds));

  const grouped = new Map<string, ContainerEnvVar[]>();
  for (const row of rows) {
    const existing = grouped.get(row.containerId);
    if (existing) {
      existing.push(row);
    } else {
      grouped.set(row.containerId, [row]);
    }
  }

  return grouped;
}
