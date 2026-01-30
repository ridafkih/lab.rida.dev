import { getSocketDir } from "agent-browser";
import {
  startSessionDaemon,
  stopSessionDaemon,
  getActiveSessions,
  isSessionActive,
  isSessionReady,
  getSessionPort,
  getSessionStreamPort,
} from "./daemon-manager";
import { reconciler } from "./reconciler";

const API_PORT = parseInt(process.env.BROWSER_API_PORT ?? "80", 10);
const DEFAULT_STREAM_PORT = parseInt(
  process.env.AGENT_BROWSER_STREAM_PORT ?? "9223",
  10,
);
const ENABLE_RECONCILER = process.env.ENABLE_RECONCILER !== "false";

console.log(`Socket directory: ${getSocketDir()}`);

// Start default daemon for standalone opencode container (not session-specific)
await startSessionDaemon("default", { streamPort: DEFAULT_STREAM_PORT });

if (ENABLE_RECONCILER) {
  await reconciler.start();
}

Bun.serve({
  port: API_PORT,
  async fetch(req) {
    const url = new URL(req.url);
    const path = url.pathname;

    if (req.method === "POST" && path.startsWith("/sessions/")) {
      const sessionId = path.split("/")[2];
      if (!sessionId) {
        return Response.json({ error: "Session ID required" }, { status: 400 });
      }

      let callbackUrl: string | undefined;
      try {
        const body = await req.json();
        callbackUrl = body.callbackUrl;
      } catch {
        // No body or invalid JSON is fine
      }

      const result = await startSessionDaemon(sessionId, { callbackUrl });
      return Response.json({ sessionId, ...result });
    }

    if (req.method === "DELETE" && path.startsWith("/sessions/")) {
      const sessionId = path.split("/")[2];
      if (!sessionId) {
        return Response.json({ error: "Session ID required" }, { status: 400 });
      }
      const result = stopSessionDaemon(sessionId);
      return Response.json({ sessionId, ...result });
    }

    if (req.method === "GET" && path === "/sessions") {
      return Response.json({ sessions: getActiveSessions() });
    }

    if (req.method === "GET" && path.match(/^\/sessions\/[^/]+\/stream-port$/)) {
      const sessionId = path.split("/")[2];
      if (!sessionId) {
        return Response.json({ error: "Session ID required" }, { status: 400 });
      }
      const streamPort = getSessionStreamPort(sessionId);
      if (!streamPort) {
        return Response.json({ error: "Session not found" }, { status: 404 });
      }
      return Response.json({
        sessionId,
        streamPort,
        ready: isSessionReady(sessionId),
      });
    }

    if (req.method === "GET" && path.startsWith("/sessions/")) {
      const sessionId = path.split("/")[2];
      if (!sessionId) {
        return Response.json({ error: "Session ID required" }, { status: 400 });
      }
      return Response.json({
        sessionId,
        active: isSessionActive(sessionId),
        port: getSessionPort(sessionId),
      });
    }

    if (req.method === "GET" && path === "/health") {
      return Response.json({ status: "ok" });
    }

    return new Response("Not Found", { status: 404 });
  },
});

console.log(`Browser API listening on port ${API_PORT}`);

function gracefulShutdown() {
  console.log("Shutting down...");
  reconciler.stop();
  process.exit(0);
}

process.on("SIGTERM", gracefulShutdown);
process.on("SIGINT", gracefulShutdown);
