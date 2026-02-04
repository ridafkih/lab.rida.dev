import { z } from "zod";
import { tool } from "ai";
import type { LanguageModel } from "ai";
import type { DaemonController } from "@lab/browser-protocol";
import { executeBrowserTask, type BrowserAgentContext } from "@lab/subagents/browser";

export interface RunBrowserTaskToolContext {
  daemonController: DaemonController;
  createModel: () => LanguageModel;
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
      "Spawns a browser sub-agent to perform web tasks autonomously. The sub-agent can navigate websites, click elements, fill forms, take screenshots, and extract information. Use this when the user needs to interact with or capture information from a website.",
    inputSchema,
    execute: async ({ objective, startUrl }) => {
      try {
        const result = await executeBrowserTask({
          objective,
          startUrl,
          context: browserContext,
        });

        return {
          success: result.success,
          summary: result.summary,
          error: result.error,
          stepsExecuted: result.stepsExecuted,
          hasScreenshot: result.screenshot !== undefined,
          screenshot: result.screenshot,
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
