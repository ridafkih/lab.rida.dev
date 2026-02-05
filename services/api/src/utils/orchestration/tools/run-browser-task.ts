import { z } from "zod";
import { tool } from "ai";
import type { LanguageModel } from "ai";
import type { DaemonController } from "@lab/browser-protocol";
import { executeBrowserTask, type BrowserAgentContext } from "@lab/subagents/browser";
import { ImageStore } from "@lab/context";

export interface RunBrowserTaskToolContext {
  daemonController: DaemonController;
  createModel: () => LanguageModel;
  imageStore?: ImageStore;
}

const inputSchema = z.object({
  objective: z
    .string()
    .describe(
      "What to accomplish with the browser (e.g., 'go to example.com and take a screenshot of the pricing page')",
    ),
  startUrl: z
    .string()
    .url()
    .optional()
    .describe("Optional starting URL to navigate to before executing the objective"),
});

export function createRunBrowserTaskTool(toolContext: RunBrowserTaskToolContext) {
  const browserContext: BrowserAgentContext = {
    daemonController: toolContext.daemonController,
    createModel: toolContext.createModel,
  };

  return tool({
    description:
      "Spawns a browser sub-agent to perform web tasks autonomously. " +
      "The sub-agent can navigate websites, click elements, fill forms, and extract information. " +
      "Returns a final screenshot URL. To understand what's in the screenshot, use the analyzeImage tool.",
    inputSchema,
    execute: async ({ objective, startUrl }) => {
      try {
        const result = await executeBrowserTask({
          objective,
          startUrl,
          context: browserContext,
        });

        if (result.screenshot && toolContext.imageStore) {
          try {
            const storeResult = await toolContext.imageStore.storeBase64(result.screenshot.data, {
              prefix: "browser-tasks/",
            });

            return {
              success: result.success,
              summary: result.summary,
              error: result.error,
              stepsExecuted: result.stepsExecuted,
              hasScreenshot: true,
              screenshotUrl: storeResult.url,
              screenshotWidth: storeResult.width,
              screenshotHeight: storeResult.height,
              wasResized: storeResult.wasResized,
              trace: result.trace,
            };
          } catch (uploadError) {
            console.warn("[RunBrowserTask] Failed to upload screenshot:", uploadError);
            // Fall back to base64
          }
        }

        // Screenshot available but upload failed/not configured
        return {
          success: result.success,
          summary: result.summary,
          error: result.error,
          stepsExecuted: result.stepsExecuted,
          hasScreenshot: false,
          screenshotError: result.screenshot
            ? "Screenshot captured but storage not configured"
            : undefined,
          trace: result.trace,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        return {
          success: false,
          error: `Browser task failed: ${message}`,
          stepsExecuted: 0,
          hasScreenshot: false,
          trace: [],
        };
      }
    },
  });
}
