import { z } from "zod";
import { tool } from "ai";
import { findSessionById } from "../../repositories/session.repository";
import type { DaemonController } from "@lab/browser-protocol";
import { ImageStore } from "@lab/context";

export interface GetSessionScreenshotToolContext {
  daemonController: DaemonController;
  imageStore?: ImageStore;
}

const inputSchema = z.object({
  sessionId: z.string().describe("The session ID to get a screenshot from"),
  fullPage: z
    .boolean()
    .optional()
    .describe(
      "Set to true to capture the ENTIRE scrollable page in one image. Default is false (viewport only). Use this when you need to see all content on a long page.",
    ),
});

export function createGetSessionScreenshotTool(context: GetSessionScreenshotToolContext) {
  return tool({
    description:
      "Captures a screenshot of the browser for a session and returns a URL. " +
      "Set fullPage: true to capture the ENTIRE scrollable page. " +
      "To understand what's in the screenshot, use the analyzeImage tool with the returned URL.",
    inputSchema,
    execute: async ({ sessionId, fullPage }) => {
      const session = await findSessionById(sessionId);

      if (!session) {
        return { error: "Session not found", hasScreenshot: false };
      }

      const commandId = `screenshot-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const result = await context.daemonController.executeCommand<{ base64?: string }>(sessionId, {
        id: commandId,
        action: "screenshot",
        fullPage: fullPage ?? false,
      });

      if (!result.success || !result.data?.base64) {
        return {
          error: result.error || "Failed to capture screenshot",
          hasScreenshot: false,
        };
      }

      if (!context.imageStore) {
        return {
          error: "Screenshot storage not configured",
          hasScreenshot: false,
        };
      }

      try {
        const storeResult = await context.imageStore.storeBase64(result.data.base64, {
          prefix: `screenshots/${sessionId}/`,
        });

        return {
          hasScreenshot: true,
          screenshotUrl: storeResult.url,
          width: storeResult.width,
          height: storeResult.height,
          wasResized: storeResult.wasResized,
          description: `Screenshot captured (${storeResult.width}x${storeResult.height})`,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        return {
          error: `Failed to upload screenshot: ${message}`,
          hasScreenshot: false,
        };
      }
    },
  });
}
