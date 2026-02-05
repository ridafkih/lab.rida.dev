import { tool } from "ai";
import { z } from "zod";
import { analyzeImage } from "./analyzer";
import type { ImageAnalyzerContext } from "./types";

const analyzeImageSchema = z.object({
  url: z.string().url().describe("The URL of the image to analyze"),
  query: z
    .string()
    .describe("What you want to know about the image (be specific for better results)"),
});

/**
 * Create an AI SDK tool for image analysis.
 * This tool can be added to any agent's toolset.
 */
export function createAnalyzeImageTool(context: ImageAnalyzerContext) {
  return tool({
    description:
      "Analyze an image from a URL. Use this to understand what's shown in a screenshot or image. " +
      "Provide a specific query about what you want to know (e.g., 'What error message is displayed?', " +
      "'Describe the layout of this page', 'What is the main content?').",
    inputSchema: analyzeImageSchema,
    execute: async ({ url, query }: z.infer<typeof analyzeImageSchema>) => {
      const result = await analyzeImage({ url, query }, context);
      if (!result.success) {
        return { error: result.error };
      }
      return { analysis: result.response };
    },
  });
}
