import { isDaemonRunning, cleanupSocket, getSocketDir, getStreamPortFile } from "agent-browser";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import type { DaemonSession } from "../types/daemon";
import { widelog } from "../logging";

export interface RecoveryCallbacks {
  onRecover: (sessionId: string, streamPort: number, cdpPort?: number) => void;
}

function getCdpPortFile(sessionId: string): string {
  return `${getSocketDir()}/${sessionId}.cdp`;
}

export function recoverSession(
  sessionId: string,
  callbacks: RecoveryCallbacks,
): DaemonSession | null {
  return widelog.context(() => {
    widelog.set("event_name", "daemon.session_recovery");
    widelog.set("session_id", sessionId);

    try {
      const streamPortPath = getStreamPortFile(sessionId);
      if (!existsSync(streamPortPath)) {
        widelog.set("outcome", "skipped");
        widelog.set("skip_reason", "no_stream_port_file");
        return null;
      }

      const streamPort = parseInt(readFileSync(streamPortPath, "utf-8").trim(), 10);
      if (isNaN(streamPort)) {
        widelog.set("outcome", "skipped");
        widelog.set("skip_reason", "invalid_port_in_file");
        return null;
      }

      const cdpPortPath = getCdpPortFile(sessionId);
      let cdpPort: number | undefined;
      if (existsSync(cdpPortPath)) {
        const parsed = parseInt(readFileSync(cdpPortPath, "utf-8").trim(), 10);
        if (!isNaN(parsed)) {
          cdpPort = parsed;
        }
      }

      if (!isDaemonRunning(sessionId)) {
        widelog.set("outcome", "skipped");
        widelog.set("skip_reason", "daemon_not_running");
        cleanupSocket(sessionId);
        return null;
      }

      callbacks.onRecover(sessionId, streamPort, cdpPort);
      widelog.set("outcome", "recovered");
      widelog.set("stream_port", streamPort);
      widelog.set("cdp_port", cdpPort ?? 0);
      return {
        sessionId,
        port: streamPort,
        cdpPort: cdpPort ?? 0,
        ready: isDaemonRunning(sessionId),
      };
    } catch (error) {
      widelog.set("outcome", "error");
      widelog.errorFields(error);
      return null;
    } finally {
      widelog.flush();
    }
  }) as DaemonSession | null;
}

export function discoverExistingSessions(callbacks: RecoveryCallbacks): void {
  const socketDir = getSocketDir();
  if (!existsSync(socketDir)) return;

  const files = readdirSync(socketDir);
  const streamFiles = files.filter((file) => file.endsWith(".stream"));

  for (const streamFile of streamFiles) {
    const sessionId = streamFile.replace(".stream", "");
    if (sessionId === "default") continue;
    recoverSession(sessionId, callbacks);
  }
}
