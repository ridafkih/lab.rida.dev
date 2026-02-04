import * as fs from "node:fs/promises";
import type { Command } from "agent-browser/dist/types.js";
import type { RouteHandler } from "../../../utils/route-handler";
import { notFoundResponse, badRequestResponse, serviceUnavailableResponse } from "../../../shared/http";

async function transformScreenshotResponse(response: {
  id: string;
  success: boolean;
  data?: unknown;
  error?: string;
}): Promise<typeof response> {
  if (!response.success) return response;
  if (typeof response.data !== "object" || response.data === null) return response;
  if (!("path" in response.data) || typeof response.data.path !== "string") return response;

  try {
    const buffer = await fs.readFile(response.data.path);
    const base64 = buffer.toString("base64");
    return { ...response, data: { base64 } };
  } catch {
    return { ...response, success: false, error: `Failed to read screenshot file: ${response.data.path}` };
  }
}

async function transformRecordingResponse(response: {
  id: string;
  success: boolean;
  data?: unknown;
  error?: string;
}): Promise<typeof response> {
  if (!response.success) return response;
  if (typeof response.data !== "object" || response.data === null) return response;
  if (!("path" in response.data) || typeof response.data.path !== "string") return response;

  const data = response.data as { path: string; frames?: number };

  try {
    const buffer = await fs.readFile(data.path);
    const base64 = buffer.toString("base64");
    return {
      ...response,
      data: {
        path: data.path,
        frames: data.frames,
        base64,
        mimeType: "video/webm",
      },
    };
  } catch {
    return { ...response, success: false, error: `Failed to read recording file: ${data.path}` };
  }
}

export const POST: RouteHandler = async (request, params, { daemonManager }) => {
  const sessionId = params.sessionId!;

  const session = daemonManager.getSession(sessionId);
  if (!session) {
    return notFoundResponse("Session not found");
  }

  if (!daemonManager.isReady(sessionId)) {
    return serviceUnavailableResponse("Session not ready");
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequestResponse("Invalid JSON body");
  }

  if (typeof body !== "object" || body === null || !("id" in body) || !("action" in body)) {
    return badRequestResponse("Command must have 'id' and 'action' fields");
  }

  const command = body as Command;

  console.log(`[Command] ${sessionId} -> ${command.action}`);
  const response = await daemonManager.executeCommand(sessionId, command);

  if (command.action === "screenshot") {
    const transformed = await transformScreenshotResponse(response);
    return Response.json(transformed);
  }

  if (command.action === "recording_stop") {
    const transformed = await transformRecordingResponse(response);
    return Response.json(transformed);
  }

  return Response.json(response);
};
