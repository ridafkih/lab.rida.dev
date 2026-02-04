import { config } from "../../config/environment";
import { CORS_HEADERS, buildSseResponse } from "../../shared/http";
import { createPromptContext } from "../prompts/context";
import type { PromptService } from "../../types/prompt";
import { findSessionById, updateSessionOpencodeId } from "../repositories/session.repository";
import { getProjectSystemPrompt } from "../repositories/project.repository";
import { resolveWorkspacePathBySession } from "../workspace/resolve-path";
import { publisher } from "../../clients/publisher";
import { setLastMessage } from "../stores/last-message-store";

const PROMPT_ENDPOINTS = ["/session/", "/prompt", "/message"];
const QUESTION_ENDPOINTS = ["/question/"];

async function safeJsonBody(request: Request): Promise<Record<string, unknown>> {
  if (!request.body) return {};
  try {
    return await request.json();
  } catch {
    return {};
  }
}

function shouldInjectSystemPrompt(path: string, method: string): boolean {
  return method === "POST" && PROMPT_ENDPOINTS.some((endpoint) => path.includes(endpoint));
}

function isQuestionRequest(path: string, method: string): boolean {
  return method === "POST" && QUESTION_ENDPOINTS.some((endpoint) => path.includes(endpoint));
}

function isSessionCreateRequest(path: string, method: string): boolean {
  return method === "POST" && path === "/session";
}

function extractUserMessageText(body: Record<string, unknown>): string | null {
  const parts = body.parts;
  if (!Array.isArray(parts)) return null;

  const textPart = parts.find(
    (part): part is { type: string; text: string } =>
      typeof part === "object" &&
      part !== null &&
      part.type === "text" &&
      typeof part.text === "string",
  );

  return textPart?.text ?? null;
}

async function getSessionData(labSessionId: string) {
  const session = await findSessionById(labSessionId);
  if (!session) return null;

  const systemPrompt = await getProjectSystemPrompt(session.projectId);

  return {
    sessionId: labSessionId,
    projectId: session.projectId,
    projectSystemPrompt: systemPrompt,
  };
}

async function buildProxyBody(
  request: Request,
  path: string,
  labSessionId: string | null,
  workspacePath: string | null,
  promptService: PromptService,
): Promise<BodyInit | null> {
  const hasBody = ["POST", "PUT", "PATCH"].includes(request.method);
  if (!hasBody) return null;

  const isSessionCreate = isSessionCreateRequest(path, request.method);
  if (labSessionId && isSessionCreate && workspacePath) {
    const originalBody = await safeJsonBody(request);
    return JSON.stringify({ ...originalBody, directory: workspacePath });
  }

  // Handle question reply/reject - inject directory
  const isQuestion = isQuestionRequest(path, request.method);
  if (labSessionId && isQuestion && workspacePath) {
    const originalBody = await safeJsonBody(request);
    return JSON.stringify({ ...originalBody, directory: workspacePath });
  }

  const isPromptEndpoint = shouldInjectSystemPrompt(path, request.method);
  if (!labSessionId || !isPromptEndpoint) {
    console.log("[opencode-proxy] Skipping prompt injection:", { labSessionId, isPromptEndpoint });
    return request.body;
  }

  const originalBody = await safeJsonBody(request);

  const userMessageText = extractUserMessageText(originalBody);
  if (userMessageText) {
    setLastMessage(labSessionId, userMessageText);
    publisher.publishDelta(
      "sessionMetadata",
      { uuid: labSessionId },
      { lastMessage: userMessageText },
    );
  }

  const sessionData = await getSessionData(labSessionId);
  if (!sessionData) {
    console.log("[opencode-proxy] No session data found for:", labSessionId);
    return JSON.stringify({ ...originalBody, directory: workspacePath });
  }

  const promptContext = createPromptContext({
    sessionId: sessionData.sessionId,
    projectId: sessionData.projectId,
    projectSystemPrompt: sessionData.projectSystemPrompt,
  });

  const { text: composedPrompt, includedFragments } = promptService.compose(promptContext);
  console.log("[opencode-proxy] Composed prompt:", {
    labSessionId,
    includedFragments,
    promptLength: composedPrompt?.length ?? 0,
    fullPrompt: composedPrompt,
  });

  const existingTools =
    originalBody.tools && typeof originalBody.tools === "object" ? originalBody.tools : {};
  const tools = { ...existingTools, bash: false };

  if (!composedPrompt) {
    return JSON.stringify({
      ...originalBody,
      directory: workspacePath,
      tools,
    });
  }

  const existingSystem = originalBody.system ?? "";
  const combinedSystem = composedPrompt + (existingSystem ? "\n\n" + existingSystem : "");

  return JSON.stringify({
    ...originalBody,
    system: combinedSystem,
    directory: workspacePath,
    tools,
  });
}

function buildForwardHeaders(request: Request): Headers {
  const forwardHeaders = new Headers(request.headers);
  forwardHeaders.delete("X-Lab-Session-Id");
  forwardHeaders.delete("host");
  return forwardHeaders;
}

function buildStandardResponse(proxyResponse: Response): Response {
  const responseHeaders = new Headers(proxyResponse.headers);
  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    responseHeaders.set(key, value);
  }
  return new Response(proxyResponse.body, {
    status: proxyResponse.status,
    headers: responseHeaders,
  });
}

function isSseResponse(path: string, proxyResponse: Response): boolean {
  return (
    path.includes("/event") ||
    proxyResponse.headers.get("content-type")?.includes("text/event-stream") === true
  );
}

async function handleSessionCreateResponse(
  proxyResponse: Response,
  labSessionId: string,
  workspacePath: string,
): Promise<Response> {
  if (!proxyResponse.ok) {
    return buildStandardResponse(proxyResponse);
  }

  const responseBody = await proxyResponse.json();
  const opencodeSessionId = responseBody?.id;

  if (opencodeSessionId) {
    await updateSessionOpencodeId(labSessionId, opencodeSessionId, workspacePath);
  }

  const responseHeaders = new Headers(proxyResponse.headers);
  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    responseHeaders.set(key, value);
  }
  return new Response(JSON.stringify(responseBody), {
    status: proxyResponse.status,
    headers: responseHeaders,
  });
}

function buildTargetUrl(path: string, url: URL, workspacePath: string | null): string {
  const targetParams = new URLSearchParams(url.search);
  if (workspacePath) {
    targetParams.set("directory", workspacePath);
  }
  const queryString = targetParams.toString();
  return `${config.opencodeUrl}${path}${queryString ? `?${queryString}` : ""}`;
}

function createAbortableStream(
  upstream: ReadableStream<Uint8Array> | null,
  abortController: AbortController,
): ReadableStream<Uint8Array> | null {
  if (!upstream) return null;

  return new ReadableStream({
    async start(controller) {
      const reader = upstream.getReader();

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
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
      abortController.abort();
    },
  });
}

export type OpenCodeProxyHandler = (request: Request, url: URL) => Promise<Response>;

export function createOpenCodeProxyHandler(promptService: PromptService): OpenCodeProxyHandler {
  return async function handleOpenCodeProxy(request: Request, url: URL): Promise<Response> {
    const path = url.pathname.replace(/^\/opencode/, "");
    const labSessionId = request.headers.get("X-Lab-Session-Id");
    const workspacePath = labSessionId ? await resolveWorkspacePathBySession(labSessionId) : null;
    const targetUrl = buildTargetUrl(path, url, workspacePath);

    console.log("[opencode-proxy]", {
      path,
      labSessionId,
      workspacePath,
      targetUrl,
    });

    const forwardHeaders = buildForwardHeaders(request);
    const body = await buildProxyBody(request, path, labSessionId, workspacePath, promptService);

    const upstreamAbort = new AbortController();
    request.signal.addEventListener("abort", () => upstreamAbort.abort(), { once: true });

    const proxyResponse = await fetch(targetUrl, {
      method: request.method,
      headers: forwardHeaders,
      body,
      signal: upstreamAbort.signal,
      ...(body ? { duplex: "half" } : {}),
    });

    // Log non-SSE responses for debugging
    if (path.includes("/message")) {
      const responseClone = proxyResponse.clone();
      const responseBody = await responseClone.text();
      console.log("[opencode-proxy] /message response:", {
        status: proxyResponse.status,
        body: responseBody.slice(0, 500),
      });
    }

    if (isSseResponse(path, proxyResponse)) {
      return buildSseResponse(
        createAbortableStream(proxyResponse.body, upstreamAbort),
        proxyResponse.status,
      );
    }

    if (isSessionCreateRequest(path, request.method) && labSessionId && workspacePath) {
      return handleSessionCreateResponse(proxyResponse, labSessionId, workspacePath);
    }

    return buildStandardResponse(proxyResponse);
  };
}
