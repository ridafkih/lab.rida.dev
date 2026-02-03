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

async function getSessionServices(sessionId: string): Promise<SessionServicesResponse | null> {
  const response = await fetch(`${config.apiBaseUrl}/internal/sessions/${sessionId}/services`);
  if (!response.ok) return null;
  return response.json();
}

export function restartContainer(server: McpServer, { docker }: ToolContext) {
  server.registerTool(
    "restart_container",
    {
      description:
        "Restart a service container in the session. Use list_processes first to see available services and their hostnames.",
      inputSchema: {
        sessionId: z.string().describe("The Lab session ID (provided in the system prompt)"),
        hostname: z
          .string()
          .describe("The hostname of the service to restart (from list_processes)"),
        timeout: z
          .number()
          .optional()
          .describe("Seconds to wait before killing the container (default: 10)"),
      },
    },
    async (args) => {
      const data = await getSessionServices(args.sessionId);
      if (!data) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Error: Could not find session "${args.sessionId}". Make sure the session exists.`,
            },
          ],
        };
      }

      const service = data.services.find(({ hostname }) => hostname === args.hostname);
      if (!service) {
        const available = data.services.map(({ hostname }) => hostname).join(", ");
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Error: Service "${args.hostname}" not found. Available services: ${available || "(none)"}`,
            },
          ],
        };
      }

      const exists = await docker.containerExists(service.dockerId);
      if (!exists) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Error: Container for service "${args.hostname}" is not running`,
            },
          ],
        };
      }

      const timeout = args.timeout ?? 10;
      await docker.restartContainer(service.dockerId, timeout);

      return {
        content: [{ type: "text", text: `Successfully restarted service "${args.hostname}"` }],
      };
    },
  );
}
