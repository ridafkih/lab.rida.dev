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
    hostname: string | null;
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

function serviceNotFoundError(hostname: string, available: string[]): ToolResult {
  return errorResult(
    `Error: Service "${hostname}" not found. Available services: ${available.join(", ") || "(none)"}`,
  );
}

function portNotFoundError(port: number, available: number[]): ToolResult {
  return errorResult(
    `Error: No service found on port ${port}. Available ports: ${available.join(", ") || "(none)"}`,
  );
}

function containerNotRunningError(hostname: string): ToolResult {
  return errorResult(`Error: Container for service "${hostname}" is not running`);
}

export function container(server: McpServer, { docker }: ToolContext) {
  server.registerTool(
    "container_list_processes",
    {
      description:
        "List all running processes (containers) in the session. Shows the current status of each service including their hostname, image, and exposed ports.",
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
        hostname: service.hostname,
        image: service.image,
        status: service.status,
        ports: service.ports,
      }));

      return textResult(JSON.stringify(output, null, 2));
    },
  );

  server.registerTool(
    "container_get_logs",
    {
      description:
        "View recent logs from a service in the session. Use container_list_processes first to see available services and their hostnames.",
      inputSchema: {
        sessionId: z.string().describe("The Lab session ID (provided in the system prompt)"),
        hostname: z
          .string()
          .describe("The hostname of the service (from container_list_processes)"),
        tail: z.number().optional().describe("Number of lines to retrieve (default: 100)"),
      },
    },
    async (args) => {
      const data = await getSessionServices(args.sessionId);
      if (!data) return sessionNotFoundError(args.sessionId);

      const service = data.services.find(({ hostname }) => hostname === args.hostname);
      if (!service) {
        const available = data.services.map(({ hostname }) => hostname).filter(Boolean) as string[];
        return serviceNotFoundError(args.hostname, available);
      }

      const exists = await docker.containerExists(service.dockerId);
      if (!exists) return containerNotRunningError(args.hostname);

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
    "container_restart",
    {
      description:
        "Restart a service container in the session. Use container_list_processes first to see available services and their hostnames.",
      inputSchema: {
        sessionId: z.string().describe("The Lab session ID (provided in the system prompt)"),
        hostname: z
          .string()
          .describe("The hostname of the service to restart (from container_list_processes)"),
        timeout: z
          .number()
          .optional()
          .describe("Seconds to wait before killing the container (default: 10)"),
      },
    },
    async (args) => {
      const data = await getSessionServices(args.sessionId);
      if (!data) return sessionNotFoundError(args.sessionId);

      const service = data.services.find(({ hostname }) => hostname === args.hostname);
      if (!service) {
        const available = data.services.map(({ hostname }) => hostname).filter(Boolean) as string[];
        return serviceNotFoundError(args.hostname, available);
      }

      const exists = await docker.containerExists(service.dockerId);
      if (!exists) return containerNotRunningError(args.hostname);

      const timeout = args.timeout ?? 10;
      await docker.restartContainer(service.dockerId, timeout);

      return textResult(`Successfully restarted service "${args.hostname}"`);
    },
  );

  server.registerTool(
    "container_get_internal_url",
    {
      description:
        "Get the internal URL for a service running in the session. This URL can be used with agent-browser to navigate to the service, or with curl/fetch to make HTTP requests from within the workspace container. Use container_list_processes first to see available services.",
      inputSchema: {
        sessionId: z.string().describe("The Lab session ID (provided in the system prompt)"),
        port: z.number().describe("The port number of the service (from container_list_processes)"),
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
    "container_get_external_url",
    {
      description:
        "Get the external URL for a service running in the session. This is the public URL that a user would need to visit in their browser to access the exposed service. Use container_list_processes first to see available services and their ports.",
      inputSchema: {
        sessionId: z.string().describe("The Lab session ID (provided in the system prompt)"),
        port: z.number().describe("The port number of the service (from container_list_processes)"),
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
