import { db } from "@lab/database/client";
import { sessions } from "@lab/database/schema/sessions";
import { projects } from "@lab/database/schema/projects";
import { eq } from "drizzle-orm";

const opencodeUrl = process.env.OPENCODE_URL;

const PROMPT_ENDPOINTS = ["/session/", "/prompt", "/message"];

function shouldInjectSystemPrompt(path: string, method: string): boolean {
  return method === "POST" && PROMPT_ENDPOINTS.some((endpoint) => path.includes(endpoint));
}

async function getSystemPrompt(labSessionId: string): Promise<string | null> {
  const [session] = await db.select().from(sessions).where(eq(sessions.id, labSessionId));

  if (!session) {
    return null;
  }

  const [project] = await db.select().from(projects).where(eq(projects.id, session.projectId));

  return project?.systemPrompt ?? null;
}

async function buildProxyBody(
  request: Request,
  path: string,
  labSessionId: string | null,
): Promise<BodyInit | null> {
  const hasBody = ["POST", "PUT", "PATCH"].includes(request.method);

  if (!hasBody) {
    return null;
  }

  if (!labSessionId || !shouldInjectSystemPrompt(path, request.method)) {
    return request.body;
  }

  const systemPrompt = await getSystemPrompt(labSessionId);

  if (!systemPrompt) {
    return request.body;
  }

  const originalBody = await request.json();
  const existingSystem = originalBody.system ?? "";
  const combinedSystem = systemPrompt + (existingSystem ? "\n\n" + existingSystem : "");

  return JSON.stringify({ ...originalBody, system: combinedSystem });
}

function buildForwardHeaders(request: Request): Headers {
  const forwardHeaders = new Headers(request.headers);
  forwardHeaders.delete("X-Lab-Session-Id");
  forwardHeaders.delete("host");
  return forwardHeaders;
}

function buildSseResponse(proxyResponse: Response): Response {
  const body = proxyResponse.body;

  if (!body) {
    return new Response(null, {
      status: proxyResponse.status,
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Lab-Session-Id",
      },
    });
  }

  return new Response(body, {
    status: proxyResponse.status,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Lab-Session-Id",
    },
  });
}

function buildStandardResponse(proxyResponse: Response): Response {
  const responseHeaders = new Headers(proxyResponse.headers);
  responseHeaders.set("Access-Control-Allow-Origin", "*");
  responseHeaders.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  responseHeaders.set(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-Lab-Session-Id",
  );

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

export async function handleOpenCodeProxy(request: Request, url: URL): Promise<Response> {
  if (!opencodeUrl) {
    return new Response("OPENCODE_URL not configured", { status: 500 });
  }

  const path = url.pathname.replace(/^\/opencode/, "");
  const targetUrl = `${opencodeUrl}${path}${url.search}`;

  const labSessionId = request.headers.get("X-Lab-Session-Id");
  const forwardHeaders = buildForwardHeaders(request);
  const body = await buildProxyBody(request, path, labSessionId);

  const proxyResponse = await fetch(targetUrl, {
    method: request.method,
    headers: forwardHeaders,
    body,
    ...(body ? { duplex: "half" } : {}),
  } as RequestInit);

  if (isSseResponse(path, proxyResponse)) {
    return buildSseResponse(proxyResponse);
  }

  return buildStandardResponse(proxyResponse);
}
