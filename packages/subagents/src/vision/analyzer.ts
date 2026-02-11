import { createAnthropic } from "@ai-sdk/anthropic";
import { createMoonshotAI } from "@ai-sdk/moonshotai";
import { createOpenAI } from "@ai-sdk/openai";
import { generateText, type LanguageModel } from "ai";
import type {
  AnalyzeImageInput,
  AnalyzeImageResult,
  ImageAnalyzerConfig,
  ImageAnalyzerContext,
} from "./types";

/**
 * Create a language model from config.
 */
export function createVisionModel(config: ImageAnalyzerConfig): LanguageModel {
  switch (config.provider) {
    case "anthropic": {
      const anthropic = createAnthropic({ apiKey: config.apiKey });
      return anthropic(config.model);
    }
    case "openai": {
      const openai = createOpenAI({ apiKey: config.apiKey });
      return openai(config.model);
    }
    case "moonshotai": {
      const moonshotai = createMoonshotAI({ apiKey: config.apiKey });
      return moonshotai(config.model);
    }
    default:
      throw new Error(`Unsupported provider: ${config.provider}`);
  }
}

/**
 * Create an ImageAnalyzerContext from environment variables.
 * Expects: IMAGE_ANALYZER_PROVIDER, IMAGE_ANALYZER_MODEL, IMAGE_ANALYZER_API_KEY
 *
 * Falls back to Claude 3 Haiku if ANTHROPIC_API_KEY is available,
 * or GPT-4o-mini if OPENAI_API_KEY is available.
 */
export function createVisionContextFromEnv(): ImageAnalyzerContext | undefined {
  // Check for explicit config first
  const provider = process.env.IMAGE_ANALYZER_PROVIDER as
    | "anthropic"
    | "openai"
    | "moonshotai"
    | undefined;
  const model = process.env.IMAGE_ANALYZER_MODEL;
  const apiKey = process.env.IMAGE_ANALYZER_API_KEY;

  if (provider && model && apiKey) {
    const visionModel = createVisionModel({ provider, model, apiKey });
    return { createModel: () => visionModel };
  }

  throw new Error(
    "The provider, model or apiKey was missing for the vision context"
  );
}

/**
 * Analyze an image from a URL with a specific query.
 * Fetches the image, sends to a vision model, and returns the analysis.
 */
export async function analyzeImage(
  input: AnalyzeImageInput,
  context: ImageAnalyzerContext
): Promise<AnalyzeImageResult> {
  try {
    // Fetch the image
    const response = await fetch(input.url);
    if (!response.ok) {
      return {
        success: false,
        error: `Failed to fetch image: ${response.status} ${response.statusText}`,
      };
    }

    const contentType = response.headers.get("content-type") || "image/png";
    const arrayBuffer = await response.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");

    // Call the vision model
    const model = context.createModel();
    const result = await generateText({
      model,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              image: `data:${contentType};base64,${base64}`,
            },
            {
              type: "text",
              text: input.query,
            },
          ],
        },
      ],
    });

    return {
      success: true,
      response: result.text,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return {
      success: false,
      error: `Image analysis failed: ${message}`,
    };
  }
}
