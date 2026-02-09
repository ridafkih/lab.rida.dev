import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";

type TextContent = { type: "text"; text: string };
type ImageContent = { type: "image"; data: string; mimeType: "image/png" };
type Content = TextContent | ImageContent;

export interface ToolResult {
  [key: string]: unknown;
  isError?: boolean;
  content: Content[];
}

export interface CommandNode {
  description: string;
  children?: Record<string, CommandNode>;
  params?: z.ZodRawShape;
  handler?: (args: Record<string, unknown>, context: CommandContext) => Promise<ToolResult>;
}

interface CommandContext {
  sessionId: string;
  generateCommandId: () => string;
  [key: string]: unknown;
}

interface HierarchicalToolConfig {
  name: string;
  description: string;
  sessionParam?: string;
  tree: Record<string, CommandNode>;
  contextFactory?: (sessionId: string) => CommandContext;
}

/**
 * Parse a command path string into segments.
 * e.g., "interact click" -> ["interact", "click"]
 */
function parseCommandPath(input: string): string[] {
  return input.trim().split(/\s+/).filter(Boolean);
}

/**
 * Format help text for a node's available subcommands
 */
function formatHelp(
  node: CommandNode | Record<string, CommandNode>,
  currentPath: string[],
): string {
  const children = "children" in node ? node.children : node;
  if (!children) return "";

  const pathStr = currentPath.length > 0 ? currentPath.join(" ") : "";
  const prefix = pathStr ? `${pathStr} ` : "";

  const lines: string[] = [];

  if (currentPath.length > 0) {
    lines.push(`**${pathStr}** commands:\n`);
  } else {
    lines.push("**Available categories:**\n");
  }

  for (const [name, child] of Object.entries(children)) {
    const hasChildren = child.children && Object.keys(child.children).length > 0;
    const hasHandler = !!child.handler;

    if (hasChildren && !hasHandler) {
      lines.push(`- \`${name}\`: ${child.description} (has subcommands)`);
    } else if (hasHandler && child.params) {
      lines.push(`- \`${name}\`: ${child.description}`);
      lines.push(`  Parameters (pass in subcommandArguments):`);
      for (const [paramName, paramSchema] of Object.entries(child.params)) {
        // Extract description from zod schema if available
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const desc =
          (paramSchema as any)?.description || (paramSchema as any)?._zod?.def?.description || "";
        lines.push(`    - \`${paramName}\`: ${desc}`);
      }
    } else if (hasHandler) {
      lines.push(`- \`${name}\`: ${child.description}`);
    } else {
      lines.push(`- \`${name}\`: ${child.description}`);
    }
  }

  lines.push("");
  lines.push(`Use: \`${prefix}<command>\` to see more or execute`);

  return lines.join("\n");
}

function getChildren(
  node: CommandNode | Record<string, CommandNode>,
): Record<string, CommandNode> | undefined {
  // If it has a description, it's a CommandNode
  if ("description" in node) {
    return (node as CommandNode).children;
  }
  // Otherwise it's the root tree (Record<string, CommandNode>)
  return node as Record<string, CommandNode>;
}

/**
 * Navigate the command tree to find the target node
 */
function navigateTree(
  tree: Record<string, CommandNode>,
  path: string[],
): {
  node: CommandNode | Record<string, CommandNode>;
  remainingPath: string[];
  traversedPath: string[];
} {
  let current: CommandNode | Record<string, CommandNode> = tree;
  const traversedPath: string[] = [];

  for (let i = 0; i < path.length; i++) {
    const segment = path[i]!;
    const children = getChildren(current);

    if (!children || !(segment in children)) {
      return { node: current, remainingPath: path.slice(i), traversedPath };
    }

    current = children[segment]!;
    traversedPath.push(segment);
  }

  return { node: current, remainingPath: [], traversedPath };
}

/**
 * Validate parameters against a Zod schema
 */
function validateParams(
  params: Record<string, unknown>,
  schema: z.ZodRawShape,
): { success: true; data: Record<string, unknown> } | { success: false; error: string } {
  const zodSchema = z.object(schema);
  const result = zodSchema.safeParse(params);

  if (result.success) {
    return { success: true, data: result.data as Record<string, unknown> };
  }

  const issues = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ");
  return { success: false, error: `Invalid parameters: ${issues}` };
}

function generateCommandId(): string {
  return `mcp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Create and register a hierarchical tool with the MCP server
 */
export function createHierarchicalTool(server: McpServer, config: HierarchicalToolConfig): void {
  const { name, description, tree, contextFactory } = config;

  server.registerTool(
    name,
    {
      description: `${description}. Run with no command to see available categories.`,
      inputSchema: {
        sessionId: z.string().describe("The session ID"),
        command: z
          .string()
          .optional()
          .describe("Command path, e.g., 'interact click' or 'nav goto'"),
        subcommandArguments: z
          .record(z.string(), z.unknown())
          .optional()
          .describe("Arguments for the subcommand as key-value pairs"),
      },
    },
    async (args) => {
      const { sessionId, command, subcommandArguments } = args as {
        sessionId: string;
        command?: string;
        subcommandArguments?: Record<string, unknown>;
      };

      // Create context for handlers
      const context: CommandContext = contextFactory
        ? contextFactory(sessionId)
        : { sessionId, generateCommandId };

      // If no command, show top-level categories
      if (!command || command.trim() === "") {
        return {
          content: [{ type: "text", text: formatHelp(tree, []) }],
        };
      }

      const path = parseCommandPath(command);
      const { node, remainingPath, traversedPath } = navigateTree(tree, path);

      // If we have remaining path segments, the command path is invalid
      if (remainingPath.length > 0) {
        const available = "children" in node ? Object.keys(node.children || {}) : Object.keys(node);
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Unknown command: '${remainingPath[0]}' at path '${traversedPath.join(" ")}'\nAvailable: ${available.join(", ")}`,
            },
          ],
        };
      }

      // Check if this is a CommandNode with a handler
      if ("handler" in node && node.handler) {
        // This is an executable command
        const commandNode = node as CommandNode;
        const handler = commandNode.handler!;
        const params = subcommandArguments ?? {};

        // Validate params if schema exists
        if (commandNode.params) {
          const validation = validateParams(params, commandNode.params);
          if (!validation.success) {
            return {
              isError: true,
              content: [{ type: "text", text: validation.error }],
            };
          }
          return handler(validation.data, context);
        }

        return handler(params, context);
      }

      // Node has children but no handler - show available subcommands
      if ("children" in node && node.children) {
        return {
          content: [{ type: "text", text: formatHelp(node, traversedPath) }],
        };
      }

      // This is the tree root level
      return {
        content: [{ type: "text", text: formatHelp(node, traversedPath) }],
      };
    },
  );
}
