import {
  type DaemonStatus,
  type BrowserCommand,
  type CommandResult,
  StatusResponse,
  UrlResponse,
  BrowserError,
  executeCommand,
} from "@lab/browser-protocol";

export { executeCommand };

export const start = async (
  baseUrl: string,
  sessionId: string,
  url?: string,
): Promise<{ port: number }> => {
  const response = await fetch(`${baseUrl}/daemons/${sessionId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw BrowserError.daemonStartFailed(sessionId, `HTTP ${response.status}: ${body}`);
  }

  const data = await response.json();
  return { port: data.port };
};

export const stop = async (baseUrl: string, sessionId: string): Promise<void> => {
  const response = await fetch(`${baseUrl}/daemons/${sessionId}`, {
    method: "DELETE",
  });

  if (!response.ok && response.status !== 404) {
    const body = await response.text();
    throw BrowserError.daemonStopFailed(sessionId, `HTTP ${response.status}: ${body}`);
  }
};

export const navigate = async (baseUrl: string, sessionId: string, url: string): Promise<void> => {
  const response = await fetch(`${baseUrl}/daemons/${sessionId}/navigate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw BrowserError.navigationFailed(sessionId, url, `HTTP ${response.status}: ${body}`);
  }
};

export const getStatus = async (
  baseUrl: string,
  sessionId: string,
): Promise<DaemonStatus | null> => {
  let response: Response;
  try {
    response = await fetch(`${baseUrl}/daemons/${sessionId}`);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    throw BrowserError.connectionFailed(sessionId, message);
  }

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    const body = await response.text();
    throw BrowserError.connectionFailed(sessionId, `HTTP ${response.status}: ${body}`);
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown parse error";
    throw BrowserError.connectionFailed(sessionId, `Invalid JSON response: ${message}`);
  }

  const parsed = StatusResponse.safeParse(data);
  if (!parsed.success) {
    throw BrowserError.connectionFailed(
      sessionId,
      `Invalid status response: ${parsed.error.message}`,
    );
  }

  return {
    running: parsed.data.running,
    ready: parsed.data.ready,
    port: parsed.data.port,
  };
};

export const getCurrentUrl = async (baseUrl: string, sessionId: string): Promise<string | null> => {
  let response: Response;
  try {
    response = await fetch(`${baseUrl}/daemons/${sessionId}/url`);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    throw BrowserError.connectionFailed(sessionId, message);
  }

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    const body = await response.text();
    throw BrowserError.connectionFailed(sessionId, `HTTP ${response.status}: ${body}`);
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown parse error";
    throw BrowserError.connectionFailed(sessionId, `Invalid JSON response: ${message}`);
  }

  const parsed = UrlResponse.safeParse(data);
  if (!parsed.success) {
    throw BrowserError.connectionFailed(sessionId, `Invalid URL response: ${parsed.error.message}`);
  }

  return parsed.data.url;
};

export const launch = async (baseUrl: string, sessionId: string): Promise<void> => {
  let response: Response;
  try {
    response = await fetch(`${baseUrl}/daemons/${sessionId}/launch`, {
      method: "POST",
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    throw BrowserError.connectionFailed(sessionId, message);
  }

  if (!response.ok) {
    const body = await response.text();
    throw BrowserError.connectionFailed(sessionId, `HTTP ${response.status}: ${body}`);
  }
};

export const isHealthy = async (baseUrl: string): Promise<boolean> => {
  try {
    const response = await fetch(`${baseUrl}/health`);
    return response.ok;
  } catch (error) {
    console.debug("[DaemonController] Health check failed:", error);
    return false;
  }
};
