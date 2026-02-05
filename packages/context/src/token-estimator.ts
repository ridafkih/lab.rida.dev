/**
 * Token estimation utilities for managing Claude context window usage.
 *
 * Image token formula: tokens = (width × height) / 750
 * Text token estimate: ~4 characters per token for English
 */

/**
 * Estimate tokens for an image based on dimensions.
 * Formula from Anthropic: tokens = (width × height) / 750
 *
 * @param width - Image width in pixels
 * @param height - Image height in pixels
 * @returns Estimated token count
 */
export function estimateImageTokens(width: number, height: number): number {
  return Math.ceil((width * height) / 750);
}

/**
 * Estimate maximum tokens for a resized image.
 * When images are resized to max 1568px, worst case is 1568×1568 = ~3,280 tokens.
 *
 * @param maxDimension - Maximum dimension after resize (default: 1568)
 * @returns Maximum possible tokens for a resized image
 */
export function estimateMaxResizedImageTokens(maxDimension = 1568): number {
  return Math.ceil((maxDimension * maxDimension) / 750);
}

/**
 * Estimate tokens for text content.
 * Rough estimate: ~4 characters per token for English text.
 *
 * @param text - Text content
 * @returns Estimated token count
 */
export function estimateTextTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export interface TokenBudget {
  /** Tokens used by system prompt */
  system: number;
  /** Tokens used by conversation messages */
  messages: number;
  /** Approximate tool schema overhead */
  tools: number;
  /** Tokens used by images */
  images: number;
  /** Total tokens used */
  total: number;
  /** Remaining tokens available */
  remaining: number;
}

export interface TokenBudgetInput {
  systemPrompt?: string;
  messages?: string[];
  /** Number of images (assumes max 1568×1568 = ~3,280 tokens each) */
  imageCount?: number;
  /** Actual image dimensions if known: [width, height][] */
  imageDimensions?: [number, number][];
  /** Tool schema overhead estimate */
  toolOverhead?: number;
  /** Maximum context window size (default: 200000 for Claude) */
  maxTokens?: number;
}

/**
 * Calculate token budget for a conversation.
 *
 * @param input - Budget calculation input
 * @returns Token budget breakdown
 */
export function calculateBudget(input: TokenBudgetInput): TokenBudget {
  const {
    systemPrompt = "",
    messages = [],
    imageCount = 0,
    imageDimensions,
    toolOverhead = 500,
    maxTokens = 200000,
  } = input;

  const system = estimateTextTokens(systemPrompt);
  const messagesTokens = messages.reduce((sum, m) => sum + estimateTextTokens(m), 0);
  const tools = toolOverhead;

  let images: number;
  if (imageDimensions && imageDimensions.length > 0) {
    // Use actual dimensions if provided
    images = imageDimensions.reduce((sum, [w, h]) => sum + estimateImageTokens(w, h), 0);
  } else {
    // Assume worst case: 1568×1568 = ~3,280 tokens per image
    images = imageCount * estimateMaxResizedImageTokens();
  }

  const total = system + messagesTokens + tools + images;

  return {
    system,
    messages: messagesTokens,
    tools,
    images,
    total,
    remaining: maxTokens - total,
  };
}

/**
 * Check if adding more images would exceed the context budget.
 *
 * @param currentBudget - Current token budget
 * @param additionalImages - Number of additional images to add
 * @param safetyMargin - Tokens to reserve for response (default: 10000)
 * @returns Whether the additional images would fit
 */
export function canAddImages(
  currentBudget: TokenBudget,
  additionalImages: number,
  safetyMargin = 10000,
): boolean {
  const additionalTokens = additionalImages * estimateMaxResizedImageTokens();
  return currentBudget.remaining - additionalTokens >= safetyMargin;
}
