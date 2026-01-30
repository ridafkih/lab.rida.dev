import {
  startDaemon,
  setSession,
  isDaemonRunning as agentIsDaemonRunning,
  getPidFile,
  cleanupSocket,
} from "agent-browser";
import { readFileSync, existsSync } from "node:fs";

const activeSessions = new Map<string, { port: number; ready: boolean }>();
const readyCallbacks = new Map<string, string>(); // sessionId -> callback URL

const BASE_STREAM_PORT = parseInt(
  process.env.AGENT_BROWSER_STREAM_PORT ?? "9223",
  10,
);
let nextStreamPort = BASE_STREAM_PORT + 1; // +1 because BASE_STREAM_PORT is reserved for the default session

function allocatePort(): number {
  return nextStreamPort++;
}

export function isDaemonRunning(sessionId: string): boolean {
  return agentIsDaemonRunning(sessionId);
}

function killDaemonProcess(sessionId: string): boolean {
  try {
    const pidFile = getPidFile(sessionId);
    if (!existsSync(pidFile)) {
      return false;
    }

    const pid = parseInt(readFileSync(pidFile, "utf-8").trim(), 10);
    if (isNaN(pid)) {
      return false;
    }

    process.kill(pid, "SIGTERM");

    // Clean up socket and PID file
    cleanupSocket(sessionId);

    return true;
  } catch (err) {
    console.warn(`Failed to kill daemon process for session ${sessionId}:`, err);
    return false;
  }
}

export function getSessionPort(sessionId: string): number | undefined {
  return activeSessions.get(sessionId)?.port;
}

export function getSessionStreamPort(sessionId: string): number | undefined {
  return activeSessions.get(sessionId)?.port;
}

export function isSessionActive(sessionId: string): boolean {
  return activeSessions.has(sessionId);
}

export function isSessionReady(sessionId: string): boolean {
  return activeSessions.get(sessionId)?.ready ?? false;
}

export function getActiveSessions(): string[] {
  return [...activeSessions.keys()];
}

export async function startSessionDaemon(
  sessionId: string,
  options: { streamPort?: number; callbackUrl?: string } = {},
): Promise<{ status: "started" | "already_running"; port: number; ready: boolean }> {
  const existing = activeSessions.get(sessionId);
  if (existing) {
    return { status: "already_running", port: existing.port, ready: existing.ready };
  }

  const port = options.streamPort ?? allocatePort();
  activeSessions.set(sessionId, { port, ready: false });

  if (options.callbackUrl) {
    readyCallbacks.set(sessionId, options.callbackUrl);
  }

  setSession(sessionId);

  // Start daemon in background, notify when ready
  startDaemon({ streamPort: port })
    .then(() => {
      console.log(`Daemon ready for session: ${sessionId} on port ${port}`);
      const session = activeSessions.get(sessionId);
      if (session) {
        session.ready = true;
      }

      // Notify callback if registered
      const callbackUrl = readyCallbacks.get(sessionId);
      if (callbackUrl) {
        console.log(`Notifying callback for session ${sessionId}: ${callbackUrl}`);
        fetch(callbackUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId, port, ready: true }),
        })
          .then((res) => {
            console.log(`Callback response for session ${sessionId}: ${res.status}`);
          })
          .catch((err) => {
            console.warn(`Failed to notify callback for session ${sessionId}:`, err);
          });
        readyCallbacks.delete(sessionId);
      } else {
        console.log(`No callback registered for session ${sessionId}`);
      }
    })
    .catch((err) => {
      console.error(`Daemon failed for session ${sessionId}:`, err);
      activeSessions.delete(sessionId);
      readyCallbacks.delete(sessionId);
    });

  console.log(`Starting daemon for session: ${sessionId} on port ${port}`);
  return { status: "started", port, ready: false };
}

export function stopSessionDaemon(sessionId: string): {
  status: "stopped" | "not_found";
} {
  const wasTracked = activeSessions.has(sessionId);

  // Try to kill the actual daemon process
  const killed = killDaemonProcess(sessionId);

  // Remove from tracking
  activeSessions.delete(sessionId);
  readyCallbacks.delete(sessionId);

  if (!wasTracked && !killed) {
    return { status: "not_found" };
  }

  console.log(`Stopped daemon for session: ${sessionId}`);
  return { status: "stopped" };
}
