import type {
  SandboxAgentClient,
  SandboxAgentEvent,
  SandboxAgentInfo,
  SandboxAgentModel,
} from "../types/dependencies";

interface SSEFrame {
  eventType: string;
  eventData: string;
}

function* parseSSELines(lines: string[]): Generator<SSEFrame> {
  let eventType = "";
  let eventData = "";

  for (const line of lines) {
    if (line.startsWith("event: ")) {
      eventType = line.slice(7).trim();
    } else if (line.startsWith("data: ")) {
      eventData = line.slice(6);
    } else if (line === "" && eventData) {
      yield { eventType, eventData };
      eventType = "";
      eventData = "";
    }
  }
}

function parseSSEFrame(frame: SSEFrame): SandboxAgentEvent | null {
  try {
    const parsed = JSON.parse(frame.eventData);
    return {
      type: frame.eventType || parsed.type || "unknown",
      sequence: parsed.sequence ?? 0,
      data: parsed.data ?? parsed,
    } as SandboxAgentEvent;
  } catch {
    return null;
  }
}

async function* readSSEStream(
  reader: ReadableStreamDefaultReader<Uint8Array>
): AsyncGenerator<SandboxAgentEvent> {
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const frame of parseSSELines(lines)) {
        const event = parseSSEFrame(frame);
        if (event) {
          yield event;
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

export function createSandboxAgentClient(baseUrl: string): SandboxAgentClient {
  async function request(
    path: string,
    options?: RequestInit
  ): Promise<Response> {
    const response = await fetch(`${baseUrl}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options?.headers,
      },
    });
    if (!response.ok) {
      const text = await response.text().catch(() => response.statusText);
      throw new Error(
        `Sandbox Agent ${options?.method ?? "GET"} ${path} failed (${response.status}): ${text}`
      );
    }
    return response;
  }

  return {
    baseUrl,

    async createSession(sessionId, config) {
      await request(`/v1/sessions/${sessionId}`, {
        method: "POST",
        body: JSON.stringify(config),
      });
    },

    async postMessage(sessionId, message) {
      await request(`/v1/sessions/${sessionId}/messages`, {
        method: "POST",
        body: JSON.stringify({ message }),
      });
    },

    async *streamEvents(sessionId, options) {
      const params = new URLSearchParams();
      if (options?.offset !== undefined) {
        params.set("offset", String(options.offset));
      }
      const query = params.toString();
      const url = `${baseUrl}/v1/sessions/${sessionId}/events/sse${query ? `?${query}` : ""}`;

      const response = await fetch(url, {
        headers: { Accept: "text/event-stream" },
        signal: options?.signal,
      });

      if (!response.ok) {
        throw new Error(`SSE stream failed (${response.status})`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        return;
      }

      yield* readSSEStream(reader);
    },

    async getEvents(sessionId, options) {
      const params = new URLSearchParams();
      if (options?.offset !== undefined) {
        params.set("offset", String(options.offset));
      }
      const query = params.toString();
      const response = await request(
        `/v1/sessions/${sessionId}/events${query ? `?${query}` : ""}`
      );
      const data = await response.json();
      return (
        Array.isArray(data) ? data : (data.events ?? [])
      ) as SandboxAgentEvent[];
    },

    async deleteSession(sessionId) {
      await request(`/v1/sessions/${sessionId}/terminate`, { method: "POST" });
    },

    async replyPermission(sessionId, permissionId, reply) {
      await request(
        `/v1/sessions/${sessionId}/permissions/${permissionId}/reply`,
        {
          method: "POST",
          body: JSON.stringify({ reply }),
        }
      );
    },

    async replyQuestion(sessionId, questionId, answers) {
      await request(`/v1/sessions/${sessionId}/questions/${questionId}/reply`, {
        method: "POST",
        body: JSON.stringify({ answers }),
      });
    },

    async rejectQuestion(sessionId, questionId) {
      await request(
        `/v1/sessions/${sessionId}/questions/${questionId}/reject`,
        { method: "POST" }
      );
    },

    async listAgents() {
      const response = await request("/v1/agents");
      const data = await response.json();
      return (
        Array.isArray(data) ? data : (data.agents ?? [])
      ) as SandboxAgentInfo[];
    },

    async listModels(agent) {
      const response = await request(`/v1/agents/${agent}/models`);
      const data = await response.json();
      return (
        Array.isArray(data) ? data : (data.models ?? [])
      ) as SandboxAgentModel[];
    },

    async readFile(path) {
      const params = new URLSearchParams({ path });
      const response = await request(`/v1/fs/file?${params}`);
      return response.text();
    },
  };
}
