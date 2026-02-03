import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { z } from "zod/v4";
import type { ToolContext } from "../types/tool";
import { config } from "../config/environment";
import {
  createHierarchicalTool,
  type CommandNode,
  type ToolResult,
} from "../utils/hierarchical-tool";

interface CommandResponse {
  id: string;
  success: boolean;
  data?: unknown;
  error?: string;
}

async function executeCommand(
  sessionId: string,
  command: Record<string, unknown>,
): Promise<CommandResponse> {
  const response = await fetch(`${config.browserDaemonUrl}/daemons/${sessionId}/command`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(command),
  });

  if (!response.ok) {
    const text = await response.text();
    return { id: command.id as string, success: false, error: `HTTP ${response.status}: ${text}` };
  }

  return response.json();
}

function createS3Client(): S3Client {
  return new S3Client({
    endpoint: config.rustfs.endpoint,
    region: "us-east-1",
    credentials: {
      accessKeyId: config.rustfs.accessKey,
      secretAccessKey: config.rustfs.secretKey,
    },
    forcePathStyle: true,
  });
}

async function uploadToRustFS(data: Buffer, filename: string): Promise<string> {
  const s3 = createS3Client();

  await s3.send(
    new PutObjectCommand({
      Bucket: config.rustfs.bucket,
      Key: filename,
      Body: data,
      ContentType: "image/png",
    }),
  );

  return `${config.rustfs.publicUrl}/${config.rustfs.bucket}/${filename}`;
}

function errorResult(message: string): ToolResult {
  return {
    isError: true,
    content: [{ type: "text", text: `Error: ${message}` }],
  };
}

function handleResult(result: CommandResponse): ToolResult {
  if (!result.success) {
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: `Error: ${result.error || "Unknown error"}`,
        },
      ],
    };
  }

  return {
    content: [
      {
        type: "text",
        text: typeof result.data === "string" ? result.data : JSON.stringify(result.data, null, 2),
      },
    ],
  };
}

async function handleScreenshotResult(
  sessionId: string,
  result: CommandResponse,
): Promise<ToolResult> {
  if (!result.success) {
    return {
      isError: true,
      content: [{ type: "text", text: `Error: ${result.error || "Failed to capture screenshot"}` }],
    };
  }

  const data = result.data;
  const base64 =
    typeof data === "object" && data !== null && "base64" in data && typeof data.base64 === "string"
      ? data.base64
      : null;

  if (!base64) {
    return {
      isError: true,
      content: [{ type: "text", text: "Error: Screenshot data not returned" }],
    };
  }

  const buffer = Buffer.from(base64, "base64");
  const timestamp = Date.now();
  const filename = `${sessionId}/${timestamp}.png`;

  try {
    const url = await uploadToRustFS(buffer, filename);
    return {
      content: [
        { type: "image", data: base64, mimeType: "image/png" },
        { type: "text", text: `Screenshot captured successfully and available at ${url}` },
      ],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      isError: true,
      content: [{ type: "text", text: `Error: Failed to upload screenshot: ${message}` }],
    };
  }
}

function simpleHandler(
  action: string,
  requiredParams: string[] = [],
  paramMapping?: Record<string, string>,
): CommandNode["handler"] {
  return async (args, ctx) => {
    for (const param of requiredParams) {
      if (args[param] === undefined) {
        return errorResult(`'${param}' is required for ${action}`);
      }
    }

    const command: Record<string, unknown> = {
      id: ctx.generateCommandId(),
      action,
    };

    for (const [key, value] of Object.entries(args)) {
      const mappedKey = paramMapping?.[key] ?? key;
      command[mappedKey] = value;
    }

    const result = await executeCommand(ctx.sessionId, command);
    return handleResult(result);
  };
}

function screenshotHandler(): CommandNode["handler"] {
  return async (args, ctx) => {
    const command = {
      id: ctx.generateCommandId(),
      action: "screenshot",
      fullPage: args.fullPage,
    };
    const result = await executeCommand(ctx.sessionId, command);
    return handleScreenshotResult(ctx.sessionId, result);
  };
}

const browserTree: Record<string, CommandNode> = {
  snapshot: {
    description:
      "Get the accessibility tree of the page. Use this to understand page structure and find elements before interacting.",
    handler: simpleHandler("snapshot"),
  },
  screenshot: {
    description: "Capture a screenshot of the current page",
    params: { fullPage: z.boolean().optional() },
    handler: screenshotHandler(),
  },
  interact: {
    description: "Click, type, drag, and other interactions",
    children: {
      click: {
        description: "Click an element",
        params: { selector: z.string() },
        handler: simpleHandler("click", ["selector"]),
      },
      dblclick: {
        description: "Double-click an element",
        params: { selector: z.string() },
        handler: simpleHandler("dblclick", ["selector"]),
      },
      type: {
        description: "Type text into element (appends to existing)",
        params: { selector: z.string(), text: z.string() },
        handler: simpleHandler("type", ["selector", "text"]),
      },
      fill: {
        description: "Clear and fill input with value",
        params: { selector: z.string(), value: z.string() },
        handler: simpleHandler("fill", ["selector", "value"]),
      },
      press: {
        description: "Press keyboard key (e.g., Enter, Tab, Control+a)",
        params: { key: z.string() },
        handler: async (args, ctx) => {
          if (!args.key) return errorResult("'key' is required for press");
          const command = {
            id: ctx.generateCommandId(),
            action: "keyboard",
            keys: args.key,
          };
          const result = await executeCommand(ctx.sessionId, command);
          return handleResult(result);
        },
      },
      hover: {
        description: "Hover over element",
        params: { selector: z.string() },
        handler: simpleHandler("hover", ["selector"]),
      },
      focus: {
        description: "Focus element",
        params: { selector: z.string() },
        handler: simpleHandler("focus", ["selector"]),
      },
      drag: {
        description: "Drag from source to target element",
        params: { source: z.string(), target: z.string() },
        handler: simpleHandler("drag", ["source", "target"]),
      },
      check: {
        description: "Check a checkbox",
        params: { selector: z.string() },
        handler: simpleHandler("check", ["selector"]),
      },
      uncheck: {
        description: "Uncheck a checkbox",
        params: { selector: z.string() },
        handler: simpleHandler("uncheck", ["selector"]),
      },
      select: {
        description: "Select dropdown option(s)",
        params: { selector: z.string(), values: z.array(z.string()) },
        handler: simpleHandler("select", ["selector", "values"]),
      },
      upload: {
        description: "Upload files to input",
        params: { selector: z.string(), files: z.array(z.string()) },
        handler: simpleHandler("upload", ["selector", "files"]),
      },
      download: {
        description: "Download by clicking element",
        params: { selector: z.string(), path: z.string() },
        handler: simpleHandler("download", ["selector", "path"]),
      },
    },
  },
  nav: {
    description: "Page navigation and scrolling",
    children: {
      goto: {
        description: "Navigate to URL",
        params: {
          url: z.string(),
          waitUntil: z.enum(["load", "domcontentloaded", "networkidle"]).optional(),
        },
        handler: async (args, ctx) => {
          if (!args.url) return errorResult("'url' is required for goto");
          const command = {
            id: ctx.generateCommandId(),
            action: "navigate",
            url: args.url,
            waitUntil: args.waitUntil,
          };
          const result = await executeCommand(ctx.sessionId, command);
          return handleResult(result);
        },
      },
      back: {
        description: "Go back in history",
        handler: simpleHandler("back"),
      },
      forward: {
        description: "Go forward in history",
        handler: simpleHandler("forward"),
      },
      reload: {
        description: "Reload the page",
        handler: simpleHandler("reload"),
      },
      scroll: {
        description: "Scroll the page or element",
        params: {
          selector: z.string().optional(),
          direction: z.enum(["up", "down", "left", "right"]).optional(),
          amount: z.number().optional(),
        },
        handler: simpleHandler("scroll"),
      },
      scrollto: {
        description: "Scroll element into view",
        params: { selector: z.string() },
        handler: simpleHandler("scrollintoview", ["selector"]),
      },
      wait: {
        description: "Wait for element or timeout",
        params: {
          selector: z.string().optional(),
          timeout: z.number().optional(),
          state: z.enum(["attached", "detached", "visible", "hidden"]).optional(),
        },
        handler: simpleHandler("wait"),
      },
    },
  },

  element: {
    description: "Get element properties and state",
    children: {
      text: {
        description: "Get text content of element",
        params: { selector: z.string() },
        handler: simpleHandler("gettext", ["selector"]),
      },
      attr: {
        description: "Get attribute value",
        params: { selector: z.string(), name: z.string() },
        handler: async (args, ctx) => {
          if (!args.selector) return errorResult("'selector' is required");
          if (!args.name) return errorResult("'name' is required");
          const command = {
            id: ctx.generateCommandId(),
            action: "getattribute",
            selector: args.selector,
            attribute: args.name,
          };
          const result = await executeCommand(ctx.sessionId, command);
          return handleResult(result);
        },
      },
      visible: {
        description: "Check if element is visible",
        params: { selector: z.string() },
        handler: simpleHandler("isvisible", ["selector"]),
      },
      enabled: {
        description: "Check if element is enabled",
        params: { selector: z.string() },
        handler: simpleHandler("isenabled", ["selector"]),
      },
      checked: {
        description: "Check if checkbox/radio is checked",
        params: { selector: z.string() },
        handler: simpleHandler("ischecked", ["selector"]),
      },
      count: {
        description: "Count matching elements",
        params: { selector: z.string() },
        handler: simpleHandler("count", ["selector"]),
      },
      box: {
        description: "Get bounding box",
        params: { selector: z.string() },
        handler: simpleHandler("boundingbox", ["selector"]),
      },
      styles: {
        description: "Get computed styles",
        params: { selector: z.string() },
        handler: simpleHandler("styles", ["selector"]),
      },
    },
  },

  page: {
    description: "HTML, PDF, URL, title, eval, close",
    children: {
      html: {
        description: "Get page HTML (optional selector)",
        params: { selector: z.string().optional() },
        handler: simpleHandler("content"),
      },
      pdf: {
        description: "Save page as PDF",
        params: {
          path: z.string(),
          format: z
            .enum([
              "Letter",
              "Legal",
              "Tabloid",
              "Ledger",
              "A0",
              "A1",
              "A2",
              "A3",
              "A4",
              "A5",
              "A6",
            ])
            .optional(),
        },
        handler: simpleHandler("pdf", ["path"]),
      },
      url: {
        description: "Get current URL",
        handler: simpleHandler("url"),
      },
      title: {
        description: "Get page title",
        handler: simpleHandler("title"),
      },
      eval: {
        description: "Execute JavaScript",
        params: { script: z.string() },
        handler: simpleHandler("evaluate", ["script"]),
      },
      close: {
        description: "Close the browser",
        handler: simpleHandler("close"),
      },
    },
  },

  debug: {
    description: "Console logs, errors, highlighting",
    children: {
      console: {
        description: "Get console logs",
        params: { clear: z.boolean().optional() },
        handler: simpleHandler("console"),
      },
      errors: {
        description: "Get page errors",
        params: { clear: z.boolean().optional() },
        handler: simpleHandler("errors"),
      },
      highlight: {
        description: "Highlight element on page",
        params: { selector: z.string() },
        handler: simpleHandler("highlight", ["selector"]),
      },
    },
  },

  state: {
    description: "Viewport, cookies, storage, tabs",
    children: {
      viewport: {
        description: "Set viewport size",
        params: { width: z.number(), height: z.number() },
        handler: simpleHandler("viewport", ["width", "height"]),
      },
      cookies: {
        description: "Cookie operations",
        children: {
          get: {
            description: "Get cookies",
            params: { urls: z.array(z.string()).optional() },
            handler: simpleHandler("cookies_get"),
          },
          set: {
            description: "Set cookies",
            params: {
              cookies: z.array(
                z.object({
                  name: z.string(),
                  value: z.string(),
                  url: z.string().optional(),
                  domain: z.string().optional(),
                  path: z.string().optional(),
                  expires: z.number().optional(),
                  httpOnly: z.boolean().optional(),
                  secure: z.boolean().optional(),
                  sameSite: z.enum(["Strict", "Lax", "None"]).optional(),
                }),
              ),
            },
            handler: simpleHandler("cookies_set", ["cookies"]),
          },
          clear: {
            description: "Clear all cookies",
            handler: simpleHandler("cookies_clear"),
          },
        },
      },
      storage: {
        description: "localStorage/sessionStorage operations",
        children: {
          get: {
            description: "Get storage value",
            params: {
              type: z.enum(["local", "session"]),
              key: z.string().optional(),
            },
            handler: async (args, ctx) => {
              if (!args.type) return errorResult("'type' is required (local or session)");
              const command = {
                id: ctx.generateCommandId(),
                action: "storage_get",
                type: args.type,
                key: args.key,
              };
              const result = await executeCommand(ctx.sessionId, command);
              return handleResult(result);
            },
          },
          set: {
            description: "Set storage value",
            params: {
              type: z.enum(["local", "session"]),
              key: z.string(),
              value: z.string(),
            },
            handler: async (args, ctx) => {
              if (!args.type) return errorResult("'type' is required (local or session)");
              if (!args.key) return errorResult("'key' is required");
              if (args.value === undefined) return errorResult("'value' is required");
              const command = {
                id: ctx.generateCommandId(),
                action: "storage_set",
                type: args.type,
                key: args.key,
                value: args.value,
              };
              const result = await executeCommand(ctx.sessionId, command);
              return handleResult(result);
            },
          },
          clear: {
            description: "Clear storage",
            params: { type: z.enum(["local", "session"]) },
            handler: async (args, ctx) => {
              if (!args.type) return errorResult("'type' is required (local or session)");
              const command = {
                id: ctx.generateCommandId(),
                action: "storage_clear",
                type: args.type,
              };
              const result = await executeCommand(ctx.sessionId, command);
              return handleResult(result);
            },
          },
        },
      },
      tabs: {
        description: "Tab management",
        children: {
          list: {
            description: "List all tabs",
            handler: simpleHandler("tab_list"),
          },
          new: {
            description: "Open new tab",
            params: { url: z.string().optional() },
            handler: simpleHandler("tab_new"),
          },
          switch: {
            description: "Switch to tab by index",
            params: { index: z.number() },
            handler: simpleHandler("tab_switch", ["index"]),
          },
          close: {
            description: "Close tab",
            params: { index: z.number().optional() },
            handler: simpleHandler("tab_close"),
          },
        },
      },
    },
  },

  mouse: {
    description: "Direct mouse control",
    children: {
      move: {
        description: "Move mouse to coordinates",
        params: { x: z.number(), y: z.number() },
        handler: simpleHandler("mousemove", ["x", "y"]),
      },
      down: {
        description: "Press mouse button",
        params: { button: z.enum(["left", "right", "middle"]).optional() },
        handler: simpleHandler("mousedown"),
      },
      up: {
        description: "Release mouse button",
        params: { button: z.enum(["left", "right", "middle"]).optional() },
        handler: simpleHandler("mouseup"),
      },
      wheel: {
        description: "Scroll with mouse wheel",
        params: {
          deltaX: z.number().optional(),
          deltaY: z.number().optional(),
          selector: z.string().optional(),
        },
        handler: simpleHandler("wheel"),
      },
    },
  },
};

export function browser(server: McpServer, _context: ToolContext) {
  createHierarchicalTool(server, {
    name: "browser",
    description: "Browser automation - run with no command to see categories",
    sessionParam: "sessionId",
    tree: browserTree,
    contextFactory: (sessionId) => ({
      sessionId,
      generateCommandId: () => `mcp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    }),
  });
}
