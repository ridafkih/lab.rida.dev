import { db } from "@lab/database/client";
import { sessions } from "@lab/database/schema/sessions";
import { sessionContainers } from "@lab/database/schema/session-containers";
import { containers } from "@lab/database/schema/containers";
import { containerPorts } from "@lab/database/schema/container-ports";
import { eq, and } from "drizzle-orm";
import { DockerClient } from "@lab/sandbox-docker";

const PORT = parseInt(process.env.PROXY_PORT ?? "8080", 10);
const PROXY_CONTAINER_NAME = process.env.PROXY_CONTAINER_NAME;

const docker = new DockerClient();
const networkConnectionCache = new Set<string>();

interface UpstreamInfo {
  hostname: string;
  port: number;
  networkName: string;
}

function formatUniqueHostname(sessionId: string, containerId: string): string {
  return `s-${sessionId.slice(0, 8)}-${containerId.slice(0, 8)}`;
}

function formatNetworkName(sessionId: string): string {
  return `lab-${sessionId}`;
}

async function ensureConnectedToNetwork(networkName: string): Promise<boolean> {
  if (networkConnectionCache.has(networkName)) {
    return false;
  }

  if (!PROXY_CONTAINER_NAME) {
    console.warn("[Proxy] PROXY_CONTAINER_NAME not set, skipping network connection");
    return false;
  }

  try {
    const isConnected = await docker.isConnectedToNetwork(PROXY_CONTAINER_NAME, networkName);
    if (!isConnected) {
      await docker.connectToNetwork(PROXY_CONTAINER_NAME, networkName);
      console.log(`[Proxy] Connected to network ${networkName}`);
      networkConnectionCache.add(networkName);
      return true;
    }
    networkConnectionCache.add(networkName);
    return false;
  } catch (error) {
    console.warn(`[Proxy] Failed to connect to network ${networkName}:`, error);
    return false;
  }
}

async function resolveUpstream(sessionId: string, port: number): Promise<UpstreamInfo | null> {
  const result = await db
    .select({
      sessionId: sessions.id,
      containerId: sessionContainers.containerId,
      sessionStatus: sessions.status,
    })
    .from(sessions)
    .innerJoin(sessionContainers, eq(sessionContainers.sessionId, sessions.id))
    .innerJoin(containers, eq(containers.id, sessionContainers.containerId))
    .innerJoin(
      containerPorts,
      and(eq(containerPorts.containerId, containers.id), eq(containerPorts.port, port)),
    )
    .where(eq(sessions.id, sessionId))
    .limit(1);

  const row = result[0];
  if (!row || row.sessionStatus !== "running") {
    return null;
  }

  return {
    hostname: formatUniqueHostname(sessionId, row.containerId),
    port,
    networkName: formatNetworkName(sessionId),
  };
}

function parseSubdomain(host: string): { sessionId: string; port: number } | null {
  const match = host.match(/^([a-f0-9-]+)--(\d+)\./);
  if (!match) {
    return null;
  }

  const sessionId = match[1];
  const portStr = match[2];

  if (!sessionId || !portStr) {
    return null;
  }

  const port = parseInt(portStr, 10);
  if (isNaN(port)) {
    return null;
  }

  return { sessionId, port };
}

async function proxyRequest(
  request: Request,
  upstream: UpstreamInfo,
  retries = 0,
): Promise<Response> {
  const url = new URL(request.url);
  const targetUrl = `http://${upstream.hostname}:${upstream.port}${url.pathname}${url.search}`;

  const headers = new Headers(request.headers);
  headers.delete("host");

  const proxyReq = new Request(targetUrl, {
    method: request.method,
    headers,
    body: request.body,
    redirect: "manual",
  });

  try {
    const response = await fetch(proxyReq);
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  } catch (error) {
    if (retries > 0) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      return proxyRequest(request, upstream, retries - 1);
    }
    console.error(`[Proxy] Upstream error for ${targetUrl}:`, error);
    return new Response("Bad Gateway", { status: 502 });
  }
}

function corsHeaders(): HeadersInit {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, PATCH, OPTIONS",
    "Access-Control-Allow-Headers": "*",
    "Access-Control-Max-Age": "86400",
  };
}

interface WebSocketData {
  upstream: UpstreamInfo;
  upstreamWs: WebSocket | null;
  path: string;
  pendingMessages: (string | Buffer)[];
}

async function handleRequest(
  request: Request,
  server: ReturnType<typeof Bun.serve<WebSocketData>>,
): Promise<Response> {
  const url = new URL(request.url);

  if (url.pathname === "/health") {
    return new Response("OK", { status: 200 });
  }

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  const host = request.headers.get("host");
  if (!host) {
    return new Response("Bad Request: Missing Host header", { status: 400 });
  }

  const parsed = parseSubdomain(host);
  if (!parsed) {
    return new Response("Bad Request: Invalid subdomain format", { status: 400 });
  }

  const { sessionId, port } = parsed;

  const upstream = await resolveUpstream(sessionId, port);
  if (!upstream) {
    return new Response("Not Found: Session or port not available", { status: 404 });
  }

  const justConnected = await ensureConnectedToNetwork(upstream.networkName);

  if (justConnected) {
    await new Promise((resolve) => setTimeout(resolve, 150));
  }

  const upgradeHeader = request.headers.get("upgrade");
  if (upgradeHeader?.toLowerCase() === "websocket") {
    const url = new URL(request.url);
    const success = server.upgrade(request, {
      data: {
        upstream,
        upstreamWs: null,
        path: url.pathname + url.search,
        pendingMessages: [],
      },
    });
    if (success) {
      return undefined as unknown as Response;
    }
    return new Response("WebSocket upgrade failed", { status: 500 });
  }

  const response = await proxyRequest(request, upstream, justConnected ? 3 : 0);

  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(corsHeaders())) {
    headers.set(key, value);
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

const server = Bun.serve<WebSocketData>({
  port: PORT,
  idleTimeout: 255,
  fetch(request, server) {
    return handleRequest(request, server);
  },
  websocket: {
    open(ws) {
      const { upstream, path } = ws.data;
      const upstreamUrl = `ws://${upstream.hostname}:${upstream.port}${path}`;

      const upstreamWs = new WebSocket(upstreamUrl);
      ws.data.upstreamWs = upstreamWs;

      upstreamWs.onopen = () => {
        for (const msg of ws.data.pendingMessages) {
          upstreamWs.send(msg);
        }
        ws.data.pendingMessages = [];
      };

      upstreamWs.onmessage = (event) => {
        ws.send(event.data);
      };

      upstreamWs.onclose = () => {
        ws.close();
      };

      upstreamWs.onerror = (error) => {
        console.error("[Proxy] Upstream WebSocket error:", error);
        ws.close();
      };
    },
    message(ws, message) {
      const { upstreamWs } = ws.data;
      if (upstreamWs && upstreamWs.readyState === WebSocket.OPEN) {
        upstreamWs.send(message);
      } else {
        ws.data.pendingMessages.push(message);
      }
    },
    close(ws) {
      const { upstreamWs } = ws.data;
      if (upstreamWs) {
        upstreamWs.close();
      }
    },
  },
});

console.log(`[Proxy] Listening on port ${server.port}`);
