import { db } from "@lab/database/client";
import {
  type ContainerPort,
  containerPorts,
} from "@lab/database/schema/container-ports";
import { eq, inArray } from "drizzle-orm";

export function findPortsByContainerId(
  containerId: string
): Promise<ContainerPort[]> {
  return db
    .select()
    .from(containerPorts)
    .where(eq(containerPorts.containerId, containerId));
}

export async function findPortsByContainerIds(
  containerIds: string[]
): Promise<Map<string, ContainerPort[]>> {
  if (containerIds.length === 0) {
    return new Map();
  }

  const rows = await db
    .select()
    .from(containerPorts)
    .where(inArray(containerPorts.containerId, containerIds));

  const grouped = new Map<string, ContainerPort[]>();
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
