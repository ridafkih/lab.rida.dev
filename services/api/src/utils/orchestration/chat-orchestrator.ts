import { generateText, streamText, stepCountIs, type LanguageModel } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import {
  listProjectsTool,
  listSessionsTool,
  getSessionMessagesTool,
  getSessionStatusTool,
  searchSessionsTool,
  getContainersTool,
  createCreateSessionTool,
  createSendMessageToSessionTool,
  createGetSessionScreenshotTool,
  createRunBrowserTaskTool,
} from "./tools";
import { buildChatOrchestratorPrompt } from "./prompts/chat-orchestrator";
import { getPlatformConfig } from "../../config/platforms";
import { breakDoubleNewlines } from "../streaming";
import type { BrowserService } from "../browser/browser-service";
import type { DaemonController } from "@lab/browser-protocol";
import type { ImageStore } from "@lab/context";
import type { ImageAnalyzerContext } from "@lab/subagents/vision";
import { config } from "../../config/environment";

export interface ChatOrchestratorInput {
  content: string;
  conversationHistory?: string[];
  platformOrigin?: string;
  platformChatId?: string;
  browserService: BrowserService;
  daemonController: DaemonController;
  modelId?: string;
  timestamp?: string;
}

export type ChatOrchestratorAction = "response" | "created_session" | "forwarded_message";

export type MessageAttachment =
  | {
      type: "image";
      data: string;
      encoding: "base64";
      format: string;
    }
  | {
      type: "image_url";
      url: string;
      width?: number;
      height?: number;
    };

export interface ChatOrchestratorResult {
  action: ChatOrchestratorAction;
  /** The full message text */
  message: string;
  /** When breakDoubleNewlines is enabled, contains the message split into paragraphs */
  messages?: string[];
  sessionId?: string;
  projectName?: string;
  attachments?: MessageAttachment[];
}

export interface ChatOrchestratorChunk {
  type: "chunk";
  text: string;
}

interface ChatModelConfig {
  provider: string;
  model: string;
  apiKey: string;
}

function getChatModelConfig(): ChatModelConfig {
  const provider = process.env.CHAT_ORCHESTRATOR_MODEL_PROVIDER;
  const model = process.env.CHAT_ORCHESTRATOR_MODEL_NAME;
  const apiKey = process.env.CHAT_ORCHESTRATOR_MODEL_API_KEY;

  if (!provider || !model || !apiKey) {
    throw new Error(
      "Missing chat orchestrator model config. Set CHAT_ORCHESTRATOR_MODEL_PROVIDER, CHAT_ORCHESTRATOR_MODEL_NAME, and CHAT_ORCHESTRATOR_MODEL_API_KEY",
    );
  }

  return { provider, model, apiKey };
}

function createModel(modelConfig: ChatModelConfig): LanguageModel {
  switch (modelConfig.provider) {
    case "anthropic": {
      const anthropic = createAnthropic({ apiKey: modelConfig.apiKey });
      return anthropic(modelConfig.model);
    }
    case "openai": {
      const openai = createOpenAI({ apiKey: modelConfig.apiKey });
      return openai(modelConfig.model);
    }
    default:
      throw new Error(`Unsupported chat orchestrator provider: ${modelConfig.provider}`);
  }
}

// Lazily created ImageStore singleton
let imageStore: ImageStore | undefined;
let imageStoreInitialized = false;

async function getImageStore(): Promise<ImageStore | undefined> {
  if (imageStoreInitialized) return imageStore;
  imageStoreInitialized = true;

  const { rustfs } = config;
  if (
    !rustfs.endpoint ||
    !rustfs.accessKey ||
    !rustfs.secretKey ||
    !rustfs.bucket ||
    !rustfs.publicUrl
  ) {
    console.log("[ChatOrchestrator] RustFS not configured, screenshots will use base64");
    return undefined;
  }

  try {
    // Dynamic import to avoid loading FFmpeg at module init time
    const { ImageStore: ImageStoreClass } = await import("@lab/context");
    imageStore = new ImageStoreClass({
      endpoint: rustfs.endpoint,
      accessKey: rustfs.accessKey,
      secretKey: rustfs.secretKey,
      bucket: rustfs.bucket,
      publicUrl: rustfs.publicUrl,
    });
    console.log("[ChatOrchestrator] ImageStore initialized for screenshot uploads");
  } catch (error) {
    console.warn("[ChatOrchestrator] Failed to initialize ImageStore:", error);
    return undefined;
  }

  return imageStore;
}

// Lazily created ImageAnalyzerContext singleton
let visionContext: ImageAnalyzerContext | undefined;
let visionContextInitialized = false;

async function getVisionContext(): Promise<ImageAnalyzerContext | undefined> {
  if (visionContextInitialized) return visionContext;
  visionContextInitialized = true;

  try {
    // Dynamic import to avoid loading at module init time
    const { createVisionContextFromEnv } = await import("@lab/subagents/vision");
    visionContext = createVisionContextFromEnv();
    if (visionContext) {
      console.log("[ChatOrchestrator] VisionContext initialized for image analysis");
    } else {
      console.log("[ChatOrchestrator] No vision API key configured, analyzeImage tool disabled");
    }
  } catch (error) {
    console.warn("[ChatOrchestrator] Failed to initialize VisionContext:", error);
    return undefined;
  }

  return visionContext;
}

interface SessionInfo {
  sessionId?: string;
  projectName?: string;
  wasForwarded?: boolean;
  attachments: MessageAttachment[];
}

function isSessionCreationOutput(
  value: unknown,
): value is { sessionId: string; projectName: string } {
  if (typeof value !== "object" || value === null) return false;
  return (
    "sessionId" in value &&
    typeof value.sessionId === "string" &&
    "projectName" in value &&
    typeof value.projectName === "string"
  );
}

function isMessageForwardedOutput(
  value: unknown,
): value is { success: boolean; sessionId: string } {
  if (typeof value !== "object" || value === null) return false;
  return (
    "success" in value &&
    value.success === true &&
    "sessionId" in value &&
    typeof value.sessionId === "string"
  );
}

interface ScreenshotUrlOutput {
  hasScreenshot: true;
  screenshotUrl: string;
  width?: number;
  height?: number;
}

function isScreenshotUrlOutput(value: unknown): value is ScreenshotUrlOutput {
  if (typeof value !== "object" || value === null) return false;
  if (!("hasScreenshot" in value) || value.hasScreenshot !== true) return false;
  return "screenshotUrl" in value && typeof value.screenshotUrl === "string";
}

interface BrowserTaskUrlOutput {
  success: boolean;
  hasScreenshot: true;
  screenshotUrl: string;
  screenshotWidth?: number;
  screenshotHeight?: number;
}

function isBrowserTaskUrlOutput(value: unknown): value is BrowserTaskUrlOutput {
  if (typeof value !== "object" || value === null) return false;
  if (!("success" in value)) return false;
  if (!("hasScreenshot" in value) || value.hasScreenshot !== true) return false;
  return "screenshotUrl" in value && typeof value.screenshotUrl === "string";
}

function extractSessionInfoFromSteps<T extends { toolResults?: Array<{ output: unknown }> }>(
  steps: T[],
): SessionInfo {
  const attachments: MessageAttachment[] = [];
  let sessionId: string | undefined;
  let projectName: string | undefined;
  let wasForwarded: boolean | undefined;

  for (const step of steps) {
    if (!step.toolResults) continue;

    for (const toolResult of step.toolResults) {
      if (isSessionCreationOutput(toolResult.output)) {
        sessionId = toolResult.output.sessionId;
        projectName = toolResult.output.projectName;
        wasForwarded = false;
      }

      if (isMessageForwardedOutput(toolResult.output)) {
        sessionId = toolResult.output.sessionId;
        wasForwarded = true;
      }

      // URL-based screenshots (preferred - lower token usage)
      if (isScreenshotUrlOutput(toolResult.output)) {
        attachments.push({
          type: "image_url",
          url: toolResult.output.screenshotUrl,
          width: toolResult.output.width,
          height: toolResult.output.height,
        });
      }

      if (isBrowserTaskUrlOutput(toolResult.output)) {
        attachments.push({
          type: "image_url",
          url: toolResult.output.screenshotUrl,
          width: toolResult.output.screenshotWidth,
          height: toolResult.output.screenshotHeight,
        });
      }
    }
  }

  return { sessionId, projectName, wasForwarded, attachments };
}

export async function chatOrchestrate(
  input: ChatOrchestratorInput,
): Promise<ChatOrchestratorResult> {
  const modelConfig = getChatModelConfig();
  const model = createModel(modelConfig);
  const store = await getImageStore();
  const vision = await getVisionContext();

  const createSessionTool = createCreateSessionTool({
    browserService: input.browserService,
    modelId: input.modelId,
  });

  const sendMessageToSessionTool = createSendMessageToSessionTool({
    modelId: input.modelId,
  });

  const getSessionScreenshotTool = createGetSessionScreenshotTool({
    daemonController: input.daemonController,
    imageStore: store,
  });

  const runBrowserTaskTool = createRunBrowserTaskTool({
    daemonController: input.daemonController,
    createModel: () => createModel(modelConfig),
    imageStore: store,
  });

  // Build base tools
  const baseTools = {
    listProjects: listProjectsTool,
    listSessions: listSessionsTool,
    getSessionMessages: getSessionMessagesTool,
    getSessionStatus: getSessionStatusTool,
    searchSessions: searchSessionsTool,
    getContainers: getContainersTool,
    createSession: createSessionTool,
    sendMessageToSession: sendMessageToSessionTool,
    getSessionScreenshot: getSessionScreenshotTool,
    runBrowserTask: runBrowserTaskTool,
  };

  // Conditionally add analyzeImage tool if vision is configured
  const tools = vision
    ? {
        ...baseTools,
        analyzeImage: (await import("@lab/subagents/vision")).createAnalyzeImageTool(vision),
      }
    : baseTools;

  const systemPrompt = buildChatOrchestratorPrompt({
    conversationHistory: input.conversationHistory,
    platformOrigin: input.platformOrigin,
    timestamp: input.timestamp,
  });

  const platformConfig = getPlatformConfig(input.platformOrigin ?? "");

  console.log(
    `[ChatOrchestrate] platform=${input.platformOrigin}, breakDoubleNewlines=${platformConfig.breakDoubleNewlines}`,
  );

  let text: string;
  let messages: string[] | undefined;
  let sessionInfo: SessionInfo;

  if (platformConfig.breakDoubleNewlines) {
    // Stream and break on double newlines for platforms like iMessage
    const result = streamText({
      model,
      tools,
      prompt: input.content,
      system: systemPrompt,
      stopWhen: stepCountIs(5),
    });

    const collectedMessages: string[] = [];
    for await (const chunk of breakDoubleNewlines(result.textStream)) {
      console.log(
        `[ChatOrchestrate] chunk ${collectedMessages.length}: "${chunk.slice(0, 50)}..."`,
      );
      collectedMessages.push(chunk);
    }
    console.log(`[ChatOrchestrate] total chunks: ${collectedMessages.length}`);

    // Wait for completion to get steps for session info extraction
    const finalResult = await result;
    text = collectedMessages.join("\n\n");
    messages = collectedMessages.length > 1 ? collectedMessages : undefined;
    sessionInfo = extractSessionInfoFromSteps(await finalResult.steps);
  } else {
    // Standard non-streaming generation
    const result = await generateText({
      model,
      tools,
      prompt: input.content,
      system: systemPrompt,
      stopWhen: stepCountIs(5),
    });

    text = result.text;
    sessionInfo = extractSessionInfoFromSteps(result.steps);
  }

  const { sessionId, projectName, wasForwarded, attachments } = sessionInfo;

  if (sessionId && wasForwarded) {
    return {
      action: "forwarded_message",
      message: text || "Message sent to the session.",
      messages,
      sessionId,
      attachments: attachments.length > 0 ? attachments : undefined,
    };
  }

  if (sessionId) {
    return {
      action: "created_session",
      message: text || `Started working on your task in ${projectName ?? "the project"}.`,
      messages,
      sessionId,
      projectName,
      attachments: attachments.length > 0 ? attachments : undefined,
    };
  }

  return {
    action: "response",
    message: text,
    messages,
    attachments: attachments.length > 0 ? attachments : undefined,
  };
}

/**
 * Streaming version of chatOrchestrate that yields chunks as they're detected.
 * Used for real-time delivery to platforms like iMessage.
 */
export async function* chatOrchestrateStream(
  input: ChatOrchestratorInput,
): AsyncGenerator<ChatOrchestratorChunk, ChatOrchestratorResult, unknown> {
  const modelConfig = getChatModelConfig();
  const model = createModel(modelConfig);
  const store = await getImageStore();
  const vision = await getVisionContext();

  const createSessionTool = createCreateSessionTool({
    browserService: input.browserService,
    modelId: input.modelId,
  });

  const sendMessageToSessionTool = createSendMessageToSessionTool({
    modelId: input.modelId,
  });

  const getSessionScreenshotTool = createGetSessionScreenshotTool({
    daemonController: input.daemonController,
    imageStore: store,
  });

  const runBrowserTaskTool = createRunBrowserTaskTool({
    daemonController: input.daemonController,
    createModel: () => createModel(modelConfig),
    imageStore: store,
  });

  // Build base tools
  const baseTools = {
    listProjects: listProjectsTool,
    listSessions: listSessionsTool,
    getSessionMessages: getSessionMessagesTool,
    getSessionStatus: getSessionStatusTool,
    searchSessions: searchSessionsTool,
    getContainers: getContainersTool,
    createSession: createSessionTool,
    sendMessageToSession: sendMessageToSessionTool,
    getSessionScreenshot: getSessionScreenshotTool,
    runBrowserTask: runBrowserTaskTool,
  };

  // Conditionally add analyzeImage tool if vision is configured
  const tools = vision
    ? {
        ...baseTools,
        analyzeImage: (await import("@lab/subagents/vision")).createAnalyzeImageTool(vision),
      }
    : baseTools;

  const systemPrompt = buildChatOrchestratorPrompt({
    conversationHistory: input.conversationHistory,
    platformOrigin: input.platformOrigin,
    timestamp: input.timestamp,
  });

  console.log(`[ChatOrchestrateStream] platform=${input.platformOrigin}, starting stream`);

  const result = streamText({
    model,
    tools,
    prompt: input.content,
    system: systemPrompt,
    stopWhen: stepCountIs(5),
  });

  const collectedChunks: string[] = [];
  let buffer = "";
  let chunkIndex = 0;
  const delimiter = "\n\n";

  // Helper to flush buffer and yield chunk
  const flushBuffer = function* () {
    // Check for any complete chunks with delimiter
    let delimiterIndex: number;
    while ((delimiterIndex = buffer.indexOf(delimiter)) !== -1) {
      const textBeforeDelimiter = buffer.slice(0, delimiterIndex).trim();
      if (textBeforeDelimiter.length > 0) {
        console.log(
          `[ChatOrchestrateStream] chunk ${chunkIndex}: "${textBeforeDelimiter.slice(0, 50)}..."`,
        );
        collectedChunks.push(textBeforeDelimiter);
        chunkIndex++;
        yield { type: "chunk" as const, text: textBeforeDelimiter };
      }
      buffer = buffer.slice(delimiterIndex + delimiter.length);
    }
  };

  // Helper to force flush remaining buffer (on tool call or end)
  const forceFlushBuffer = function* () {
    const remaining = buffer.trim();
    if (remaining.length > 0) {
      console.log(`[ChatOrchestrateStream] chunk ${chunkIndex}: "${remaining.slice(0, 50)}..."`);
      collectedChunks.push(remaining);
      chunkIndex++;
      yield { type: "chunk" as const, text: remaining };
    }
    buffer = "";
  };

  // Use fullStream to detect both text and tool calls
  for await (const event of result.fullStream) {
    if (event.type === "text-delta") {
      buffer += event.text;
      // Yield any complete chunks (split on delimiter)
      yield* flushBuffer();
    } else if (event.type === "tool-call") {
      // Flush any pending text before tool execution
      yield* forceFlushBuffer();
      console.log(`[ChatOrchestrateStream] tool call: ${event.toolName}`);
    }
  }

  // Flush any remaining text after stream ends
  yield* forceFlushBuffer();

  console.log(`[ChatOrchestrateStream] total chunks: ${collectedChunks.length}`);

  // Wait for completion to get steps for session info extraction
  const finalResult = await result;
  const text = collectedChunks.join("\n\n");
  const sessionInfo = extractSessionInfoFromSteps(await finalResult.steps);

  const { sessionId, projectName, wasForwarded, attachments } = sessionInfo;

  if (sessionId && wasForwarded) {
    return {
      action: "forwarded_message",
      message: text || "Message sent to the session.",
      messages: collectedChunks.length > 1 ? collectedChunks : undefined,
      sessionId,
      attachments: attachments.length > 0 ? attachments : undefined,
    };
  }

  if (sessionId) {
    return {
      action: "created_session",
      message: text || `Started working on your task in ${projectName ?? "the project"}.`,
      messages: collectedChunks.length > 1 ? collectedChunks : undefined,
      sessionId,
      projectName,
      attachments: attachments.length > 0 ? attachments : undefined,
    };
  }

  return {
    action: "response",
    message: text,
    messages: collectedChunks.length > 1 ? collectedChunks : undefined,
    attachments: attachments.length > 0 ? attachments : undefined,
  };
}
