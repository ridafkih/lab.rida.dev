import { z } from "zod";
import type { BrowserCommand, CommandResult } from "../types/orchestrator";

const CommandResultSchema = z.object({
  id: z.string(),
  success: z.boolean(),
  data: z.unknown().optional(),
  error: z.string().optional(),
});

export async function executeCommand<T = unknown>(
  baseUrl: string,
  sessionId: string,
  command: BrowserCommand,
): Promise<CommandResult<T>> {
  let response: Response;
  try {
    response = await fetch(`${baseUrl}/daemons/${sessionId}/command`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(command),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { id: command.id, success: false, error: `Connection failed: ${message}` };
  }

  if (!response.ok) {
    const text = await response.text();
    return { id: command.id, success: false, error: `HTTP ${response.status}: ${text}` };
  }

  let rawData: unknown;
  try {
    rawData = await response.json();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown parse error";
    return { id: command.id, success: false, error: `Invalid JSON response: ${message}` };
  }

  const parsed = CommandResultSchema.safeParse(rawData);
  if (!parsed.success) {
    return { id: command.id, success: false, error: `Invalid response format: ${parsed.error.message}` };
  }

  return {
    id: parsed.data.id,
    success: parsed.data.success,
    data: parsed.data.data as T | undefined,
    error: parsed.data.error,
  };
}
