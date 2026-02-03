import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";
import type { ToolContext } from "../types/tool";
import { config } from "../config/environment";

interface SessionServicesResponse {
  sessionId: string;
  proxyBaseDomain: string;
  services: {
    containerId: string;
    dockerId: string;
    image: string;
    status: string;
    ports: number[];
  }[];
}

interface ToolResult {
  [key: string]: unknown;
  isError?: boolean;
  content: { type: "text"; text: string }[];
}

async function getSessionServices(sessionId: string): Promise<SessionServicesResponse | null> {
  const response = await fetch(`${config.apiBaseUrl}/internal/sessions/${sessionId}/services`);
  if (!response.ok) return null;
  return response.json();
}

function textResult(text: string): ToolResult {
  return { content: [{ type: "text", text }] };
}

function errorResult(text: string): ToolResult {
  return { isError: true, content: [{ type: "text", text }] };
}

function sessionNotFoundError(sessionId: string): ToolResult {
  return errorResult(`Error: Could not find session "${sessionId}". Make sure the session exists.`);
}

function serviceNotFoundError(containerId: string, available: string[]): ToolResult {
  return errorResult(
    `Error: Service "${containerId}" not found. Available services: ${available.join(", ") || "(none)"}`,
  );
}

function portNotFoundError(port: number, available: number[]): ToolResult {
  return errorResult(
    `Error: No service found on port ${port}. Available ports: ${available.join(", ") || "(none)"}`,
  );
}

function containerNotRunningError(containerId: string): ToolResult {
  return errorResult(`Error: Container "${containerId}" is not running`);
}

export function container(server: McpServer, { docker }: ToolContext) {
  server.registerTool(
    "containers",
    {
      description:
        "List all running containers in the session. Shows containerId, image, status, and exposed ports.",
      inputSchema: {
        sessionId: z.string().describe("The Lab session ID (provided in the system prompt)"),
      },
    },
    async (args) => {
      const data = await getSessionServices(args.sessionId);
      if (!data) return sessionNotFoundError(args.sessionId);

      if (data.services.length === 0) {
        return textResult("No running processes found in this session.");
      }

      const output = data.services.map((service) => ({
        containerId: service.containerId,
        image: service.image,
        status: service.status,
        ports: service.ports,
      }));

      return textResult(JSON.stringify(output, null, 2));
    },
  );

  server.registerTool(
    "logs",
    {
      description: "View recent logs from a container. Use `containers` to see available IDs.",
      inputSchema: {
        sessionId: z.string().describe("The Lab session ID (provided in the system prompt)"),
        containerId: z.string().describe("The containerId (from `containers`)"),
        tail: z.number().optional().describe("Number of lines to retrieve (default: 100)"),
      },
    },
    async (args) => {
      const data = await getSessionServices(args.sessionId);
      if (!data) return sessionNotFoundError(args.sessionId);

      const service = data.services.find((candidate) => candidate.containerId === args.containerId);
      if (!service) {
        const available = data.services.map((candidate) => candidate.containerId);
        return serviceNotFoundError(args.containerId, available);
      }

      const exists = await docker.containerExists(service.dockerId);
      if (!exists) return containerNotRunningError(args.containerId);

      const lines = args.tail ?? 100;
      const logs: string[] = [];
      for await (const chunk of docker.streamLogs(service.dockerId, { tail: lines })) {
        const text = new TextDecoder().decode(chunk.data);
        logs.push(`[${chunk.stream}] ${text}`);
      }

      return textResult(logs.join("") || "(no logs)");
    },
  );

  server.registerTool(
    "restart_process",
    {
      description: "Restart a container. Use `containers` to see available IDs.",
      inputSchema: {
        sessionId: z.string().describe("The Lab session ID (provided in the system prompt)"),
        containerId: z.string().describe("The containerId to restart (from `containers`)"),
        timeout: z.number().optional().describe("Seconds to wait before killing (default: 10)"),
      },
    },
    async (args) => {
      const data = await getSessionServices(args.sessionId);
      if (!data) return sessionNotFoundError(args.sessionId);

      const service = data.services.find((candidate) => candidate.containerId === args.containerId);
      if (!service) {
        const available = data.services.map((candidate) => candidate.containerId);
        return serviceNotFoundError(args.containerId, available);
      }

      const exists = await docker.containerExists(service.dockerId);
      if (!exists) return containerNotRunningError(args.containerId);

      const timeout = args.timeout ?? 10;
      await docker.restartContainer(service.dockerId, timeout);

      return textResult(`Successfully restarted container "${args.containerId}"`);
    },
  );

  server.registerTool(
    "internal_url",
    {
      description:
        "Get the internal URL for a container port. Use with the browser tool or curl/fetch.",
      inputSchema: {
        sessionId: z.string().describe("The Lab session ID (provided in the system prompt)"),
        port: z.number().describe("The port number (from `containers`)"),
      },
    },
    async (args) => {
      const data = await getSessionServices(args.sessionId);
      if (!data) return sessionNotFoundError(args.sessionId);

      const service = data.services.find(({ ports }) => ports.includes(args.port));
      if (!service) {
        const availablePorts = data.services.flatMap(({ ports }) => ports);
        return portNotFoundError(args.port, availablePorts);
      }

      const internalUrl = `http://${args.sessionId}--${args.port}:${args.port}`;

      return textResult(
        `Internal URL: ${internalUrl}\n\nYou can use this URL with:\n- agent-browser: Navigate to this URL to interact with the service\n- curl/fetch: Make HTTP requests from within the workspace container\n\n This URL is not relevant to the user.`,
      );
    },
  );

  server.registerTool(
    "public_url",
    {
      description:
        "Get the public URL for a container port. Share with the user to access in their browser.",
      inputSchema: {
        sessionId: z.string().describe("The Lab session ID (provided in the system prompt)"),
        port: z.number().describe("The port number (from `containers`)"),
      },
    },
    async (args) => {
      const data = await getSessionServices(args.sessionId);
      if (!data) return sessionNotFoundError(args.sessionId);

      const service = data.services.find(({ ports }) => ports.includes(args.port));
      if (!service) {
        const availablePorts = data.services.flatMap(({ ports }) => ports);
        return portNotFoundError(args.port, availablePorts);
      }

      const externalUrl = `http://${args.sessionId}--${args.port}.${data.proxyBaseDomain}`;

      return textResult(
        `External URL: ${externalUrl}\n\nShare this URL with the user so they can access the service in their browser.`,
      );
    },
  );
}
