import { config } from "../config/environment";

const TRAILING_SLASH_PATTERN = /\/$/;

import { widelog } from "../logging";
import type {
  ChatRequest,
  ChatResult,
  OrchestrationRequest,
  OrchestrationResult,
} from "../types/messages";

class ApiClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(baseUrl: string = config.apiUrl, apiKey: string = config.apiKey) {
    this.baseUrl = baseUrl.replace(TRAILING_SLASH_PATTERN, "");
    this.apiKey = apiKey;
  }

  private get headers(): Record<string, string> {
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.apiKey}`,
    };
  }

  async orchestrate(
    request: OrchestrationRequest
  ): Promise<OrchestrationResult> {
    const response = await fetch(`${this.baseUrl}/orchestrate`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const error = await response
        .json()
        .catch(() => ({ error: "Unknown error" }));
      throw new Error(
        `Orchestration failed: ${error.error || response.statusText}`
      );
    }

    return response.json();
  }

  async getSession(
    sessionId: string
  ): Promise<{ id: string; status: string } | null> {
    const response = await fetch(`${this.baseUrl}/sessions/${sessionId}`, {
      method: "GET",
      headers: this.headers,
    });

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      throw new Error(`Failed to get session: ${response.statusText}`);
    }

    return response.json();
  }

  async isSessionActive(sessionId: string): Promise<boolean> {
    const session = await this.getSession(sessionId);
    return session !== null && session.status === "running";
  }

  async generateSessionSummary(sessionId: string): Promise<SummaryResult> {
    const response = await fetch(
      `${this.baseUrl}/internal/sessions/${sessionId}/summary`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      }
    );

    if (!response.ok) {
      const error = await response
        .json()
        .catch(() => ({ error: "Unknown error" }));
      throw new Error(
        `Summary generation failed: ${error.error || response.statusText}`
      );
    }

    return response.json();
  }

  async chat(request: ChatRequest): Promise<ChatResult> {
    const response = await fetch(`${this.baseUrl}/orchestrate/chat`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(
        `Chat orchestration failed: ${error || response.statusText}`
      );
    }

    return response.json();
  }

  /**
   * Chat with streaming support. Calls onChunk for each text chunk as it arrives.
   * Returns the final ChatResult when the stream completes.
   * Falls back to regular JSON response if server doesn't return SSE.
   */
  async chatStream(
    request: ChatRequest,
    onChunk: (text: string) => Promise<void>
  ): Promise<ChatResult> {
    const response = await fetch(`${this.baseUrl}/orchestrate/chat`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(
        `Chat orchestration failed: ${error || response.statusText}`
      );
    }

    const contentType = response.headers.get("content-type") || "";

    // If SSE response, consume the stream
    if (contentType.includes("text/event-stream")) {
      return this.consumeSseStream(response, onChunk);
    }

    // Fallback to JSON response (non-streaming platforms)
    return response.json();
  }

  private async processSseDataLine(
    data: string,
    currentEvent: string | null,
    onChunk: (text: string) => Promise<void>
  ): Promise<ChatResult | null> {
    const parsed = JSON.parse(data);

    if (currentEvent === "chunk" && parsed.text) {
      await onChunk(parsed.text);
    } else if (currentEvent === "done") {
      return parsed as ChatResult;
    } else if (currentEvent === "error") {
      throw new Error(parsed.error || "SSE stream error");
    }

    return null;
  }

  private async processSseLine(
    line: string,
    state: { currentEvent: string | null; parseErrors: number },
    onChunk: (text: string) => Promise<void>
  ): Promise<ChatResult | null> {
    if (line.startsWith("event: ")) {
      state.currentEvent = line.slice(7).trim();
      return null;
    }

    if (!line.startsWith("data: ")) {
      return null;
    }

    try {
      const result = await this.processSseDataLine(
        line.slice(6),
        state.currentEvent,
        onChunk
      );
      return result;
    } catch (parseError) {
      if (parseError instanceof SyntaxError) {
        state.parseErrors++;
        widelog.set("sse_parse_errors", state.parseErrors);
        return null;
      }
      throw parseError;
    } finally {
      state.currentEvent = null;
    }
  }

  private async readSseStream(
    reader: ReadableStreamDefaultReader<Uint8Array>,
    onChunk: (text: string) => Promise<void>
  ): Promise<ChatResult | null> {
    const decoder = new TextDecoder();
    let buffer = "";
    let finalResult: ChatResult | null = null;
    const state = { currentEvent: null as string | null, parseErrors: 0 };

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const result = await this.processSseLine(line, state, onChunk);
        if (result) {
          finalResult = result;
        }
      }
    }

    return finalResult;
  }

  private consumeSseStream(
    response: Response,
    onChunk: (text: string) => Promise<void>
  ): Promise<ChatResult> {
    return widelog.context(async () => {
      widelog.set("event_name", "api_client.consume_sse_stream");

      const reader = response.body?.getReader();
      const finalResult = await this.readSseStream(reader, onChunk);

      if (!finalResult) {
        widelog.set("outcome", "error");
        widelog.set("error_message", "SSE stream ended without final result");
        widelog.flush();
        throw new Error("SSE stream ended without final result");
      }

      widelog.set("outcome", "success");
      widelog.flush();
      return finalResult;
    });
  }

  async notifySessionComplete(request: {
    sessionId: string;
    platformOrigin: string;
    platformChatId: string;
  }): Promise<ChatResult> {
    const response = await fetch(`${this.baseUrl}/orchestrate/chat/complete`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const error = await response
        .json()
        .catch(() => ({ error: "Unknown error" }));
      throw new Error(
        `Session complete notification failed: ${error.error || response.statusText}`
      );
    }

    return response.json();
  }

  async getSessionScreenshot(
    sessionId: string
  ): Promise<ScreenshotResult | null> {
    const response = await fetch(
      `${this.baseUrl}/internal/sessions/${sessionId}/screenshot`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      return null;
    }

    return response.json();
  }
}

interface ScreenshotResult {
  sessionId: string;
  timestamp: number;
  format: string;
  encoding: string;
  data: string;
}

interface SummaryResult {
  success: boolean;
  outcome?: string;
  summary: string;
  orchestrationId?: string;
  platformOrigin?: string;
  platformChatId?: string;
  alreadySent?: boolean;
}

export const apiClient = new ApiClient();
