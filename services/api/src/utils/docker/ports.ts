import { db } from "@lab/database/client";
import { portReservations } from "@lab/database/schema/port-reservations";
import { eq, and, isNull, or, gt, lt } from "drizzle-orm";

export type PortType = "cdp" | "stream" | "container";

interface PortRange {
  start: number;
  end: number;
}

const PORT_RANGES: Record<PortType, PortRange> = {
  cdp: { start: 9222, end: 9300 },
  stream: { start: 9301, end: 9400 },
  container: { start: 9401, end: 9600 },
};

async function getUsedPortsForType(portType: PortType): Promise<Set<number>> {
  const range = PORT_RANGES[portType];
  const now = new Date();

  const reservations = await db
    .select({ port: portReservations.port })
    .from(portReservations)
    .where(
      and(
        eq(portReservations.type, portType),
        or(isNull(portReservations.expiresAt), gt(portReservations.expiresAt, now)),
      ),
    );

  return new Set(reservations.map((reservation) => reservation.port));
}

function findFirstAvailablePort(range: PortRange, usedPorts: Set<number>): number | null {
  for (let port = range.start; port <= range.end; port++) {
    if (!usedPorts.has(port)) {
      return port;
    }
  }
  return null;
}

export async function reservePort(
  sessionId: string,
  portType: PortType,
  expiresAt?: Date,
): Promise<number> {
  const range = PORT_RANGES[portType];
  const usedPorts = await getUsedPortsForType(portType);

  const availablePort = findFirstAvailablePort(range, usedPorts);

  if (availablePort === null) {
    throw new Error(
      `Port exhaustion: no available ${portType} ports in range ${range.start}-${range.end}`,
    );
  }

  await db.insert(portReservations).values({
    sessionId,
    port: availablePort,
    type: portType,
    expiresAt,
  });

  return availablePort;
}

export async function releasePort(sessionId: string, port: number): Promise<void> {
  await db
    .delete(portReservations)
    .where(and(eq(portReservations.sessionId, sessionId), eq(portReservations.port, port)));
}

export async function releaseAllPortsForSession(sessionId: string): Promise<void> {
  await db.delete(portReservations).where(eq(portReservations.sessionId, sessionId));
}

export async function getPortsForSession(sessionId: string): Promise<
  Array<{
    port: number;
    type: string;
  }>
> {
  return db
    .select({ port: portReservations.port, type: portReservations.type })
    .from(portReservations)
    .where(eq(portReservations.sessionId, sessionId));
}

export async function cleanupExpiredPortReservations(): Promise<number> {
  const now = new Date();

  const expiredReservations = await db
    .delete(portReservations)
    .where(and(lt(portReservations.expiresAt, now)))
    .returning({ id: portReservations.id });

  return expiredReservations.length;
}
