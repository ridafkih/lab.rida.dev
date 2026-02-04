import type { DaemonController } from "@lab/browser-protocol";
import type { BrowserService } from "../utils/browser/browser-service";
import type { PromptService } from "./prompt";

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";

export interface RouteContext {
  browserService: BrowserService;
  daemonController: DaemonController;
  initializeSessionContainers: (sessionId: string, projectId: string) => Promise<void>;
  promptService?: PromptService;
}

export type RouteHandler = (
  request: Request,
  params: Record<string, string>,
  context: RouteContext,
) => Response | Promise<Response>;

export type RouteModule = Partial<Record<HttpMethod, RouteHandler>>;
