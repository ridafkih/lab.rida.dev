import { type WebSocketData } from "@lab/multiplayer-server";
import { websocketHandler, upgrade, type Auth } from "./handlers/websocket";
import { handleOpenCodeProxy } from "./handlers/opencode-proxy";
import {
  handleBrowserStreamUpgrade,
  browserStreamHandler,
  type BrowserStreamData,
} from "./handlers/browser-stream";
import { handleBrowserReadyCallback } from "./handlers/browser-ready";
import { isHttpMethod, isRouteModule } from "./utils/route-handler";
import { join } from "node:path";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Lab-Session-Id",
};

const HTTP_NOT_FOUND = 404;
const HTTP_METHOD_NOT_ALLOWED = 405;
const HTTP_INTERNAL_SERVER_ERROR = 500;

function withCors(response: Response): Response {
  for (const [key, value] of Object.entries(corsHeaders)) {
    response.headers.set(key, value);
  }
  return response;
}

const router = new Bun.FileSystemRouter({
  dir: join(import.meta.dirname, "routes"),
  style: "nextjs",
});

const port = process.env.API_PORT;

if (port === undefined) {
  throw Error("API_PORT must be defined");
}

type CombinedWebSocketData = WebSocketData<Auth> | BrowserStreamData;

function isBrowserStreamData(data: CombinedWebSocketData): data is BrowserStreamData {
  return "type" in data && data.type === "browser-stream";
}

const combinedWebsocketHandler = {
  open(ws: any) {
    if (isBrowserStreamData(ws.data)) {
      browserStreamHandler.open(ws);
    } else {
      websocketHandler.open(ws);
    }
  },
  message(ws: any, message: string | Buffer) {
    if (isBrowserStreamData(ws.data)) {
      browserStreamHandler.message(ws, message);
    } else {
      websocketHandler.message(ws, message);
    }
  },
  close(ws: any) {
    if (isBrowserStreamData(ws.data)) {
      browserStreamHandler.close(ws);
    } else {
      websocketHandler.close(ws);
    }
  },
};

export const server = Bun.serve<CombinedWebSocketData>({
  port,
  idleTimeout: 0,
  websocket: combinedWebsocketHandler,
  async fetch(request): Promise<Response | undefined> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (url.pathname === "/ws/browser") {
      return handleBrowserStreamUpgrade(request, server);
    }

    if (url.pathname === "/ws") {
      return upgrade(request, server);
    }

    if (url.pathname.startsWith("/opencode/")) {
      return handleOpenCodeProxy(request, url);
    }

    if (url.pathname === "/internal/browser-ready" && request.method === "POST") {
      return handleBrowserReadyCallback(request);
    }

    const match = router.match(request);

    if (!match) {
      return withCors(new Response("Not found", { status: HTTP_NOT_FOUND }));
    }

    const module: unknown = await import(match.filePath);

    if (!isRouteModule(module)) {
      return withCors(
        new Response("Internal server error", { status: HTTP_INTERNAL_SERVER_ERROR }),
      );
    }

    if (!isHttpMethod(request.method)) {
      return withCors(new Response("Method not allowed", { status: HTTP_METHOD_NOT_ALLOWED }));
    }

    const handler = module[request.method];

    if (!handler) {
      return withCors(new Response("Method not allowed", { status: HTTP_METHOD_NOT_ALLOWED }));
    }

    const response = await handler(request, match.params);
    return withCors(response);
  },
});
