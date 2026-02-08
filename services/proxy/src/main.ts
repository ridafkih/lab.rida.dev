import { logger, widelog } from "./logging";
import { TIMING } from "./config/constants";
import { resolveUpstream, parseSubdomain } from "./proxy/upstream";
import { proxyRequest, corsHeaders } from "./proxy/request";
import type { WebSocketData } from "./types/proxy";
import type { setup } from "./setup";
import type { env } from "./env";

type MainOptions = {
  env: (typeof env)["inferOut"];
  extras: ReturnType<typeof setup>;
};

type MainFunction = (options: MainOptions) => unknown;

export const main = (({ extras }) => {
  const { port } = extras;

  const server = Bun.serve<WebSocketData>({
    port,
    idleTimeout: TIMING.IDLE_TIMEOUT_SECONDS,
    async fetch(request, server) {
      const url = new URL(request.url);

      if (url.pathname === "/health") {
        return new Response("OK", { status: 200 });
      }

      if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: corsHeaders() });
      }

      return widelog.context(async () => {
        widelog.set("method", request.method);
        widelog.set("path", url.pathname);
        widelog.time.start("duration_ms");

        try {
          const host = request.headers.get("host");
          if (!host) {
            widelog.set("status_code", 400);
            widelog.set("outcome", "client_error");
            return new Response("Bad Request: Missing Host header", { status: 400 });
          }

          const parsed = parseSubdomain(host);
          if (!parsed) {
            widelog.set("status_code", 400);
            widelog.set("outcome", "client_error");
            return new Response("Bad Request: Invalid subdomain format", { status: 400 });
          }

          const { sessionId, port } = parsed;
          widelog.set("session_id", sessionId);
          widelog.set("upstream_port", port);

          const upstream = await resolveUpstream(sessionId, port);
          if (!upstream) {
            widelog.set("status_code", 404);
            widelog.set("outcome", "not_found");
            return new Response("Not Found: Session or port not available", { status: 404 });
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
              widelog.set("outcome", "ws_upgrade");
              return undefined as unknown as Response;
            }
            widelog.set("status_code", 500);
            widelog.set("outcome", "ws_upgrade_failed");
            return new Response("WebSocket upgrade failed", { status: 500 });
          }

          const response = await proxyRequest(request, upstream, 0);

          const headers = new Headers(response.headers);
          for (const [key, value] of Object.entries(corsHeaders())) {
            headers.set(key, value);
          }

          const finalResponse = new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers,
          });

          widelog.set("status_code", finalResponse.status);
          widelog.set("outcome", "success");
          return finalResponse;
        } catch (error) {
          widelog.set("outcome", "error");
          widelog.errorFields(error);
          return new Response("Internal Server Error", { status: 500 });
        } finally {
          widelog.time.stop("duration_ms");
          widelog.flush();
        }
      });
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
          logger.error({ event_name: "proxy.upstream_ws_error", error });
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

  logger.info({
    event_name: "proxy.startup",
    port: server.port,
  });

  return () => {
    logger.info({ event_name: "proxy.shutdown" });
    server.stop(true);
  };
}) satisfies MainFunction;
