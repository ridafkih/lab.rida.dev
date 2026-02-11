import type { Session } from "@lab/database/schema/sessions";
import { buildSseResponse, CORS_HEADERS } from "@lab/http-utilities";
import { widelog } from "../logging";
import {
  findSessionById,
  updateSessionFields,
} from "../repositories/session.repository";
import type { SessionStateStore } from "../state/session-state-store";
import type { Publisher } from "../types/dependencies";
import type { PromptService } from "../types/prompt";
import type { SandboxAgentContainerManager } from "./container-manager";

type SandboxAgentProxyHandler = (
  request: Request,
  url: URL
) => Promise<Response>;

interface SandboxAgentProxyDeps {
  containerManager: SandboxAgentContainerManager;
  publisher: Publisher;
  promptService: PromptService;
  sessionStateStore: SessionStateStore;
}

interface ValidationSuccess<T> {
  ok: true;
  value: T;
}
interface ValidationFailure {
  ok: false;
  response: Response;
}
type ValidationResult<T> = ValidationSuccess<T> | ValidationFailure;

interface InitializedSession {
  session: Session;
  sandboxAgentUrl: string;
}

async function safeJsonBody(
  request: Request
): Promise<Record<string, unknown>> {
  if (!request.body) {
    return {};
  }
  try {
    return await request.json();
  } catch {
    return {};
  }
}

function corsResponse(body: BodyInit | null, status: number): Response {
  const headers = new Headers(CORS_HEADERS);
  headers.set("Content-Type", "application/json");
  return new Response(body, { status, headers });
}

function resolveWorkspacePath(
  workspaceDir: string | null | undefined,
  requestedPath: string
): string {
  if (workspaceDir && (requestedPath === "." || requestedPath === "")) {
    return workspaceDir;
  }
  if (workspaceDir && !requestedPath.startsWith("/")) {
    return `${workspaceDir}/${requestedPath}`;
  }
  return requestedPath;
}

function getEventItem(
  eventData: Record<string, unknown>
): Record<string, unknown> {
  if (typeof eventData.data !== "object" || eventData.data === null) {
    return {};
  }
  const data = eventData.data as Record<string, unknown>;
  if (typeof data.item === "object" && data.item !== null) {
    return data.item as Record<string, unknown>;
  }
  return data;
}

function getString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

const PATH_PREFIX = /^\/sandbox-agent/;
const PERMISSION_REPLY_PATTERN = /^\/permissions\/([^/]+)\/reply$/;
const QUESTION_REPLY_PATTERN = /^\/questions\/([^/]+)\/reply$/;
const QUESTION_REJECT_PATTERN = /^\/questions\/([^/]+)\/reject$/;

export function createSandboxAgentProxyHandler(
  deps: SandboxAgentProxyDeps
): SandboxAgentProxyHandler {
  const { containerManager, publisher, sessionStateStore } = deps;

  function getSandboxAgentUrl(labSessionId: string): Promise<string | null> {
    return containerManager.getUrlForSession(labSessionId);
  }

  function requireLabSessionId(id: string | null): ValidationResult<string> {
    if (!id) {
      return {
        ok: false,
        response: corsResponse(
          JSON.stringify({ error: "Missing X-Lab-Session-Id" }),
          400
        ),
      };
    }
    return { ok: true, value: id };
  }

  async function requireInitializedSession(
    labSessionId: string
  ): Promise<ValidationResult<InitializedSession>> {
    const session = await findSessionById(labSessionId);
    if (!session?.sandboxSessionId) {
      return {
        ok: false,
        response: corsResponse(
          JSON.stringify({ error: "Session not initialized" }),
          400
        ),
      };
    }

    const sandboxAgentUrl = await getSandboxAgentUrl(labSessionId);
    if (!sandboxAgentUrl) {
      return {
        ok: false,
        response: corsResponse(
          JSON.stringify({ error: "Sandbox agent not available" }),
          503
        ),
      };
    }

    return { ok: true, value: { session, sandboxAgentUrl } };
  }

  type RouteHandler = (
    request: Request,
    labSessionId: string | null,
    url: URL
  ) => Promise<Response>;

  const staticRoutes = new Map<string, RouteHandler>([
    ["POST /sessions", (req, sid) => handleCreateSession(req, sid)],
    ["POST /messages", (req, sid) => handleSendMessage(req, sid)],
    ["GET /events", (req, sid) => handleStreamEvents(req, sid)],
    ["DELETE /sessions", (_req, sid) => handleDeleteSession(sid)],
    ["GET /files/status", (_req, sid) => handleFileStatus(sid)],
    ["GET /files/list", (_req, sid, url) => handleFileList(sid, url)],
    ["GET /files/read", (_req, sid, url) => handleFileRead(sid, url)],
    ["GET /agents", () => handleListAgents()],
    ["GET /models", (_req, _sid, url) => handleListModels(url)],
  ]);

  function matchStaticRoute(
    path: string,
    method: string
  ): RouteHandler | undefined {
    return staticRoutes.get(`${method} ${path}`);
  }

  function handleRegexRoutes(
    path: string,
    method: string,
    request: Request,
    labSessionId: string | null
  ): Promise<Response> | null {
    if (method !== "POST") {
      return null;
    }

    const permissionMatch = path.match(PERMISSION_REPLY_PATTERN);
    if (permissionMatch?.[1]) {
      return handlePermissionReply(request, labSessionId, permissionMatch[1]);
    }

    const questionReplyMatch = path.match(QUESTION_REPLY_PATTERN);
    if (questionReplyMatch?.[1]) {
      return handleQuestionReply(request, labSessionId, questionReplyMatch[1]);
    }

    const questionRejectMatch = path.match(QUESTION_REJECT_PATTERN);
    if (questionRejectMatch?.[1]) {
      return handleQuestionReject(labSessionId, questionRejectMatch[1]);
    }

    return null;
  }

  return function handleProxy(request: Request, url: URL): Promise<Response> {
    const path = url.pathname.replace(PATH_PREFIX, "");
    const labSessionId = request.headers.get("X-Lab-Session-Id");

    widelog.set("sandbox_agent.proxy_path", path);
    widelog.set("sandbox_agent.has_lab_session_id", Boolean(labSessionId));
    if (labSessionId) {
      widelog.set("session_id", labSessionId);
    }

    const staticHandler = matchStaticRoute(path, request.method);
    if (staticHandler) {
      return staticHandler(request, labSessionId, url);
    }

    const regexResult = handleRegexRoutes(
      path,
      request.method,
      request,
      labSessionId
    );
    if (regexResult) {
      return regexResult;
    }

    return Promise.resolve(
      corsResponse(JSON.stringify({ error: "Not found" }), 404)
    );
  };

  async function handleCreateSession(
    request: Request,
    labSessionId: string | null
  ): Promise<Response> {
    const validated = requireLabSessionId(labSessionId);
    if (!validated.ok) {
      return validated.response;
    }

    const sandboxAgentUrl = await getSandboxAgentUrl(validated.value);
    if (!sandboxAgentUrl) {
      return corsResponse(
        JSON.stringify({ error: "Sandbox agent not available for session" }),
        503
      );
    }

    const body = await safeJsonBody(request);
    const sandboxSessionId = crypto.randomUUID();

    const agent = typeof body.agent === "string" ? body.agent : "claude";
    const model = typeof body.model === "string" ? body.model : undefined;

    try {
      const createBody: Record<string, unknown> = {
        agent,
        permissionMode: "acceptEdits",
      };
      if (model) {
        createBody.model = model;
      }

      const createResponse = await fetch(
        `${sandboxAgentUrl}/v1/sessions/${sandboxSessionId}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(createBody),
        }
      );

      if (!createResponse.ok) {
        const errorText = await createResponse.text().catch(() => "Unknown");
        return corsResponse(
          JSON.stringify({
            error: `Failed to create sandbox session: ${errorText}`,
          }),
          createResponse.status
        );
      }
      await updateSessionFields(validated.value, {
        sandboxSessionId,
      });

      return corsResponse(JSON.stringify({ id: sandboxSessionId }), 200);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return corsResponse(
        JSON.stringify({ error: `Failed to create session: ${message}` }),
        500
      );
    }
  }

  async function handleSendMessage(
    request: Request,
    labSessionId: string | null
  ): Promise<Response> {
    const validated = requireLabSessionId(labSessionId);
    if (!validated.ok) {
      return validated.response;
    }

    const sessionResult = await requireInitializedSession(validated.value);
    if (!sessionResult.ok) {
      return sessionResult.response;
    }
    const { session, sandboxAgentUrl } = sessionResult.value;

    const body = await safeJsonBody(request);
    const messageText = typeof body.message === "string" ? body.message : "";

    if (!messageText) {
      return corsResponse(JSON.stringify({ error: "Missing message" }), 400);
    }

    try {
      await fetch(
        `${sandboxAgentUrl}/v1/sessions/${session.sandboxSessionId}/messages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: messageText }),
        }
      );

      await sessionStateStore.setLastMessage(validated.value, messageText);
      publisher.publishDelta(
        "sessionMetadata",
        { uuid: validated.value },
        { lastMessage: messageText }
      );

      return corsResponse(JSON.stringify({ success: true }), 200);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return corsResponse(
        JSON.stringify({ error: `Failed to send message: ${message}` }),
        500
      );
    }
  }

  async function handleStreamEvents(
    request: Request,
    labSessionId: string | null
  ): Promise<Response> {
    const validated = requireLabSessionId(labSessionId);
    if (!validated.ok) {
      return validated.response;
    }

    const sessionResult = await requireInitializedSession(validated.value);
    if (!sessionResult.ok) {
      return sessionResult.response;
    }
    const { session, sandboxAgentUrl } = sessionResult.value;

    const requestUrl = new URL(request.url);
    const replay = requestUrl.searchParams.get("replay");
    const offset = requestUrl.searchParams.get("offset");

    if (replay === "true") {
      return handleReplayEvents(
        sandboxAgentUrl,
        session.sandboxSessionId ?? "",
        offset
      );
    }

    const params = new URLSearchParams();
    if (offset) {
      params.set("offset", offset);
    }
    const query = params.toString();
    const sseUrl = `${sandboxAgentUrl}/v1/sessions/${session.sandboxSessionId}/events/sse${query ? `?${query}` : ""}`;

    const upstreamAbort = new AbortController();
    request.signal.addEventListener("abort", () => upstreamAbort.abort(), {
      once: true,
    });

    const upstreamResponse = await fetch(sseUrl, {
      headers: { Accept: "text/event-stream" },
      signal: upstreamAbort.signal,
    });

    if (!upstreamResponse.body) {
      return corsResponse(JSON.stringify({ error: "No event stream" }), 502);
    }

    const responseBody = upstreamResponse.body;
    const stream = new ReadableStream({
      async start(controller) {
        const reader = responseBody.getReader();
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) {
              break;
            }
            controller.enqueue(value);
          }
          controller.close();
        } catch (error) {
          controller.error(error);
        } finally {
          reader.releaseLock();
        }
      },
      cancel() {
        upstreamAbort.abort();
      },
    });

    return buildSseResponse(stream, upstreamResponse.status);
  }

  async function handleReplayEvents(
    sandboxAgentUrl: string,
    sandboxSessionId: string,
    offset: string | null
  ): Promise<Response> {
    const params = new URLSearchParams();
    if (offset) {
      params.set("offset", offset);
    }
    const query = params.toString();
    const eventsUrl = `${sandboxAgentUrl}/v1/sessions/${sandboxSessionId}/events${query ? `?${query}` : ""}`;

    try {
      const response = await fetch(eventsUrl, {
        headers: { Accept: "application/json" },
      });

      if (!response.ok) {
        return corsResponse(
          JSON.stringify({ error: "Failed to fetch events" }),
          response.status
        );
      }

      const data = await response.json();
      const events = Array.isArray(data) ? data : (data.events ?? []);
      return corsResponse(JSON.stringify(events), 200);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return corsResponse(
        JSON.stringify({ error: `Failed to replay events: ${message}` }),
        500
      );
    }
  }

  async function handleDeleteSession(
    labSessionId: string | null
  ): Promise<Response> {
    const validated = requireLabSessionId(labSessionId);
    if (!validated.ok) {
      return validated.response;
    }

    const session = await findSessionById(validated.value);
    if (session?.sandboxSessionId) {
      const url = await getSandboxAgentUrl(validated.value);
      if (url) {
        try {
          await fetch(
            `${url}/v1/sessions/${session.sandboxSessionId}/terminate`,
            { method: "POST" }
          );
        } catch (error) {
          widelog.set(
            "sandbox_agent.terminate_error",
            error instanceof Error ? error.message : "Unknown"
          );
        }
      }
    }

    return corsResponse(JSON.stringify({ success: true }), 200);
  }

  async function handlePermissionReply(
    request: Request,
    labSessionId: string | null,
    permissionId: string
  ): Promise<Response> {
    const validated = requireLabSessionId(labSessionId);
    if (!validated.ok) {
      return validated.response;
    }

    const sessionResult = await requireInitializedSession(validated.value);
    if (!sessionResult.ok) {
      return sessionResult.response;
    }
    const { session, sandboxAgentUrl } = sessionResult.value;

    const body = await safeJsonBody(request);
    await fetch(
      `${sandboxAgentUrl}/v1/sessions/${session.sandboxSessionId}/permissions/${permissionId}/reply`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }
    );

    return corsResponse(JSON.stringify({ success: true }), 200);
  }

  async function handleQuestionReply(
    request: Request,
    labSessionId: string | null,
    questionId: string
  ): Promise<Response> {
    const validated = requireLabSessionId(labSessionId);
    if (!validated.ok) {
      return validated.response;
    }

    const sessionResult = await requireInitializedSession(validated.value);
    if (!sessionResult.ok) {
      return sessionResult.response;
    }
    const { session, sandboxAgentUrl } = sessionResult.value;

    const body = await safeJsonBody(request);
    await fetch(
      `${sandboxAgentUrl}/v1/sessions/${session.sandboxSessionId}/questions/${questionId}/reply`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }
    );

    return corsResponse(JSON.stringify({ success: true }), 200);
  }

  async function handleQuestionReject(
    labSessionId: string | null,
    questionId: string
  ): Promise<Response> {
    const validated = requireLabSessionId(labSessionId);
    if (!validated.ok) {
      return validated.response;
    }

    const sessionResult = await requireInitializedSession(validated.value);
    if (!sessionResult.ok) {
      return sessionResult.response;
    }
    const { session, sandboxAgentUrl } = sessionResult.value;

    await fetch(
      `${sandboxAgentUrl}/v1/sessions/${session.sandboxSessionId}/questions/${questionId}/reject`,
      { method: "POST" }
    );

    return corsResponse(JSON.stringify({ success: true }), 200);
  }

  async function handleFileStatus(
    labSessionId: string | null
  ): Promise<Response> {
    const validated = requireLabSessionId(labSessionId);
    if (!validated.ok) {
      return validated.response;
    }

    const session = await findSessionById(validated.value);
    if (!session?.sandboxSessionId) {
      return corsResponse(JSON.stringify([]), 200);
    }

    const sandboxAgentUrl = await getSandboxAgentUrl(validated.value);
    if (!sandboxAgentUrl) {
      return corsResponse(JSON.stringify([]), 200);
    }

    try {
      const eventsUrl = `${sandboxAgentUrl}/v1/sessions/${session.sandboxSessionId}/events`;
      const response = await fetch(eventsUrl, {
        headers: { Accept: "application/json" },
      });

      if (!response.ok) {
        return corsResponse(JSON.stringify([]), 200);
      }

      const data = await response.json();
      const events = Array.isArray(data) ? data : (data.events ?? []);
      const changedFiles = extractChangedFilesFromEvents(events);
      return corsResponse(JSON.stringify(changedFiles), 200);
    } catch (error) {
      widelog.set(
        "sandbox_agent.file_status_error",
        error instanceof Error ? error.message : "Unknown"
      );
      return corsResponse(JSON.stringify([]), 200);
    }
  }

  async function handleFileList(
    labSessionId: string | null,
    url: URL
  ): Promise<Response> {
    const validated = requireLabSessionId(labSessionId);
    if (!validated.ok) {
      return validated.response;
    }

    const session = await findSessionById(validated.value);
    if (!session?.sandboxSessionId) {
      return corsResponse(JSON.stringify([]), 200);
    }

    const requestedPath = url.searchParams.get("path") ?? ".";
    const resolvedPath = resolveWorkspacePath(
      session.workspaceDirectory,
      requestedPath
    );

    const sandboxAgentUrl = await getSandboxAgentUrl(validated.value);
    if (!sandboxAgentUrl) {
      return corsResponse(JSON.stringify([]), 200);
    }

    try {
      const params = new URLSearchParams({
        path: resolvedPath,
        sessionId: session.sandboxSessionId,
      });
      const fsUrl = `${sandboxAgentUrl}/v1/fs/entries?${params}`;
      const response = await fetch(fsUrl);

      if (!response.ok) {
        return corsResponse(JSON.stringify([]), 200);
      }

      const entries = await response.json();
      if (!Array.isArray(entries)) {
        return corsResponse(JSON.stringify([]), 200);
      }

      const workspacePrefix = session.workspaceDirectory
        ? `${session.workspaceDirectory}/`
        : "";
      const nodes = entries.map(
        (entry: { name: string; path: string; entryType: string }) => ({
          name: entry.name,
          path:
            workspacePrefix && entry.path.startsWith(workspacePrefix)
              ? entry.path.slice(workspacePrefix.length)
              : entry.path,
          type: entry.entryType === "directory" ? "directory" : "file",
        })
      );

      return corsResponse(JSON.stringify(nodes), 200);
    } catch (error) {
      widelog.set(
        "sandbox_agent.file_list_error",
        error instanceof Error ? error.message : "Unknown"
      );
      return corsResponse(JSON.stringify([]), 200);
    }
  }

  async function handleFileRead(
    labSessionId: string | null,
    url: URL
  ): Promise<Response> {
    const validated = requireLabSessionId(labSessionId);
    if (!validated.ok) {
      return validated.response;
    }

    const sessionResult = await requireInitializedSession(validated.value);
    if (!sessionResult.ok) {
      return sessionResult.response;
    }
    const { session, sandboxAgentUrl } = sessionResult.value;

    const filePath = url.searchParams.get("path");
    if (!filePath) {
      return corsResponse(JSON.stringify({ error: "Missing path" }), 400);
    }

    const resolvedFilePath = resolveWorkspacePath(
      session.workspaceDirectory,
      filePath
    );

    try {
      const params = new URLSearchParams({
        path: resolvedFilePath,
        sessionId: session.sandboxSessionId ?? "",
      });
      const fsUrl = `${sandboxAgentUrl}/v1/fs/file?${params}`;
      const response = await fetch(fsUrl);

      if (!response.ok) {
        return corsResponse(
          JSON.stringify({ type: "text", content: null, patch: null }),
          200
        );
      }

      const content = await response.text();
      return corsResponse(
        JSON.stringify({ type: "text", content, patch: null }),
        200
      );
    } catch (error) {
      widelog.set(
        "sandbox_agent.file_read_error",
        error instanceof Error ? error.message : "Unknown"
      );
      return corsResponse(
        JSON.stringify({ type: "text", content: null, patch: null }),
        200
      );
    }
  }

  async function handleListAgents(): Promise<Response> {
    const sandboxAgentUrl = containerManager.getFirstAvailableUrl();
    if (!sandboxAgentUrl) {
      return corsResponse(JSON.stringify([]), 200);
    }

    const response = await fetch(`${sandboxAgentUrl}/v1/agents`);
    const data = await response.json();
    return corsResponse(JSON.stringify(data), 200);
  }

  async function handleListModels(url: URL): Promise<Response> {
    const sandboxAgentUrl = containerManager.getFirstAvailableUrl();
    if (!sandboxAgentUrl) {
      return corsResponse(JSON.stringify([]), 200);
    }

    const agent = url.searchParams.get("agent") ?? "claude";
    const response = await fetch(
      `${sandboxAgentUrl}/v1/agents/${agent}/models`
    );
    const data = await response.json();
    return corsResponse(JSON.stringify(data), 200);
  }
}

interface ChangedFileInfo {
  path: string;
  status: "added" | "modified";
  added: number;
  removed: number;
}

function processToolCallPart(
  part: Record<string, unknown>,
  fileMap: Map<string, ChangedFileInfo>
): void {
  if (typeof part !== "object" || part === null || part.type !== "tool_call") {
    return;
  }

  const toolName = getString(part.name);
  if (toolName !== "Write" && toolName !== "Edit") {
    return;
  }

  try {
    const args = JSON.parse(
      typeof part.arguments === "string" ? part.arguments : "{}"
    );
    const filePath = getString(args.file_path);
    if (!filePath) {
      return;
    }

    const normalizedPath = filePath.startsWith("/")
      ? filePath.slice(1)
      : filePath;

    const existing = fileMap.get(normalizedPath);
    if (existing) {
      existing.status = "modified";
    } else {
      fileMap.set(normalizedPath, {
        path: normalizedPath,
        status: toolName === "Write" ? "added" : "modified",
        added: 0,
        removed: 0,
      });
    }
  } catch (error) {
    widelog.set(
      "sandbox_agent.parse_tool_args_error",
      error instanceof Error ? error.message : "Unknown"
    );
  }
}

function extractChangedFilesFromEvents(
  events: Record<string, unknown>[]
): ChangedFileInfo[] {
  const fileMap = new Map<string, ChangedFileInfo>();

  for (const event of events) {
    if (event.type !== "item.completed") {
      continue;
    }

    const item = getEventItem(event);
    const content = Array.isArray(item.content) ? item.content : [];

    for (const part of content) {
      processToolCallPart(part as Record<string, unknown>, fileMap);
    }
  }

  return [...fileMap.values()];
}
