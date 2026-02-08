import { CORS, TIMING } from "../config/constants";
import type { UpstreamInfo } from "../types/proxy";

export function corsHeaders(): HeadersInit {
  return {
    "Access-Control-Allow-Origin": CORS.ALLOW_ORIGIN,
    "Access-Control-Allow-Methods": CORS.ALLOW_METHODS,
    "Access-Control-Allow-Headers": CORS.ALLOW_HEADERS,
    "Access-Control-Max-Age": CORS.MAX_AGE,
  };
}

export async function proxyRequest(
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
    const headers = new Headers(response.headers);
    headers.delete("content-encoding");
    headers.delete("content-length");
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  } catch (error) {
    if (retries > 0) {
      await new Promise((resolve) => setTimeout(resolve, TIMING.RETRY_DELAY_MS));
      return proxyRequest(request, upstream, retries - 1);
    }
    return new Response("Bad Gateway", { status: 502 });
  }
}
