import type { LanguageModel } from "ai";

export interface ImageAnalyzerConfig {
  /** Model provider: "anthropic" or "openai" */
  provider: "anthropic" | "openai";
  /** Model name (e.g., "claude-3-haiku-20240307", "gpt-4o-mini") */
  model: string;
  /** API key for the provider */
  apiKey: string;
}

export interface ImageAnalyzerContext {
  /** Function to create the vision model */
  createModel: () => LanguageModel;
}

export interface AnalyzeImageInput {
  /** URL of the image to analyze */
  url: string;
  /** Query or question about the image */
  query: string;
}

export interface AnalyzeImageResult {
  success: boolean;
  response?: string;
  error?: string;
}
