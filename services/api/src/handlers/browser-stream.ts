import {
  browserClient,
  subscribeToBrowserSession,
  unsubscribeFromBrowserSession,
} from "../browser";

const BROWSER_WS_HOST = process.env.BROWSER_WS_HOST ?? "browser";

// Cache last frame per session
const lastFrameCache = new Map<string, string>();

export function clearFrameCache(sessionId: string): void {
  lastFrameCache.delete(sessionId);
}

export async function handleBrowserStreamUpgrade(
  request: Request,
  server: any,
): Promise<Response | undefined> {
  const url = new URL(request.url);
  const sessionId = url.searchParams.get("sessionId");

  if (!sessionId) {
    return new Response("sessionId required", { status: 400 });
  }

  if (!browserClient) {
    return new Response("Browser service not configured", { status: 503 });
  }

  // Upgrade immediately - browser startup handled in open()
  const success = server.upgrade(request, {
    data: {
      type: "browser-stream" as const,
      sessionId,
      streamPort: null as number | null,
      browserWs: null as WebSocket | null,
    },
  });

  return success ? undefined : new Response("Upgrade failed", { status: 500 });
}

export type BrowserStreamData = {
  type: "browser-stream";
  sessionId: string;
  streamPort: number | null;
  browserWs: WebSocket | null;
};

async function connectToBrowser(ws: any, sessionId: string): Promise<void> {
  if (!browserClient) {
    ws.close();
    return;
  }

  // Get the stream port - client should only connect when multiplayer says ready
  const port = await browserClient.getStreamPort(sessionId);
  if (!port) {
    ws.close();
    return;
  }

  ws.data.streamPort = port;

  // Send cached frame immediately if available
  const cachedFrame = lastFrameCache.get(sessionId);
  if (cachedFrame) {
    ws.send(cachedFrame);
  }

  const browserWs = new WebSocket(`ws://${BROWSER_WS_HOST}:${port}`);
  browserWs.onmessage = (event) => {
    const data = event.data.toString();
    // Cache frame messages
    if (data.includes('"type":"frame"')) {
      lastFrameCache.set(sessionId, data);
    }
    ws.send(event.data);
  };
  browserWs.onclose = () => ws.close();
  browserWs.onerror = () => ws.close();
  ws.data.browserWs = browserWs;
}

export const browserStreamHandler = {
  async open(ws: any) {
    const { sessionId } = ws.data as BrowserStreamData;

    // Track this connection
    await subscribeToBrowserSession(sessionId);

    // Connect to browser asynchronously
    connectToBrowser(ws, sessionId);
  },
  message(ws: any, message: string | Buffer) {
    const { browserWs } = ws.data as BrowserStreamData;
    browserWs?.send(message);
  },
  close(ws: any) {
    const { sessionId, browserWs } = ws.data as BrowserStreamData;
    browserWs?.close();

    // Untrack this connection - will cleanup after delay if no clients remain
    unsubscribeFromBrowserSession(sessionId).catch((err) => {
      console.warn(`Failed to unsubscribe from browser session ${sessionId}:`, err);
    });
  },
};
