import { HTTP_STATUS } from "../config/constants";

export const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Lab-Session-Id",
} as const;

export function withCors(response: Response): Response {
  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    response.headers.set(key, value);
  }
  return response;
}

export function badRequestResponse(message = "Bad request"): Response {
  return new Response(message, { status: HTTP_STATUS.BAD_REQUEST });
}

export function notFoundResponse(message = "Not found"): Response {
  return new Response(message, { status: HTTP_STATUS.NOT_FOUND });
}

export function errorResponse(message = "Internal server error"): Response {
  return new Response(message, { status: HTTP_STATUS.INTERNAL_SERVER_ERROR });
}

export function methodNotAllowedResponse(): Response {
  return new Response("Method not allowed", { status: HTTP_STATUS.METHOD_NOT_ALLOWED });
}

export function noContentResponse(): Response {
  return new Response(null, { status: HTTP_STATUS.NO_CONTENT });
}

export function optionsResponse(): Response {
  return new Response(null, { status: HTTP_STATUS.NO_CONTENT, headers: CORS_HEADERS });
}

export function buildSseHeaders(): Record<string, string> {
  return {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    ...CORS_HEADERS,
  };
}

export function buildSseResponse(body: ReadableStream<Uint8Array> | null, status = 200): Response {
  return new Response(body, {
    status,
    headers: buildSseHeaders(),
  });
}
