import { createOpencodeClient } from "@opencode-ai/sdk/v2/client";
import { createImageStoreFromEnv } from "@lab/context";
import { ApiServer } from "./clients/server";
import { ContainerMonitor } from "./monitors/container.monitor";
import { OpenCodeMonitor } from "./monitors/opencode.monitor";
import { LogMonitor } from "./monitors/log.monitor";
import { NetworkReconcileMonitor } from "./monitors/network-reconcile.monitor";
import { PoolManager } from "./managers/pool.manager";
import { BrowserServiceManager } from "./managers/browser-service.manager";
import { SessionLifecycleManager } from "./managers/session-lifecycle.manager";
import { ProxyManager } from "./services/proxy.service";
import { createDefaultPromptService } from "./prompts/builder";
import { DeferredPublisher } from "./shared/deferred-publisher";
import { SessionStateStore } from "./state/session-state-store";
import { RedisClient } from "bun";
import { widelog } from "./logging";
import {
  DockerClient,
  DockerNetworkManager,
  DockerWorkspaceManager,
  DockerRuntimeManager,
  DockerSessionManager,
} from "@lab/sandbox-docker";
import { Sandbox } from "@lab/sandbox-sdk";
import type { env } from "./env";

type SetupOptions = {
  env: (typeof env)["inferOut"];
};

type SetupFunction = (options: SetupOptions) => void;

export const setup = (({ env }) => {
  const dockerClient = new DockerClient();
  const sharedContainerNames = [
    env.BROWSER_CONTAINER_NAME,
    env.OPENCODE_CONTAINER_NAME,
    env.PROXY_CONTAINER_NAME,
  ];

  const sandbox = new Sandbox(dockerClient, {
    network: new DockerNetworkManager(dockerClient),
    workspace: new DockerWorkspaceManager(dockerClient, {
      workspacesVolume: "lab_session_workspaces",
      workspacesMount: "/workspaces",
    }),
    runtime: new DockerRuntimeManager(dockerClient, {
      workspacesSource: "lab_session_workspaces",
      workspacesTarget: "/workspaces",
      opencodeAuthSource: "lab_opencode_auth",
      opencodeAuthTarget: "/root/.local/share/opencode",
      browserSocketSource: "lab_browser_sockets",
      browserSocketTarget: "/tmp/agent-browser-socket",
    }),
    session: new DockerSessionManager(dockerClient, {
      sharedContainerNames,
    }),
  });

  const opencode = createOpencodeClient({ baseUrl: env.OPENCODE_URL });

  const redis = new RedisClient(env.REDIS_URL);
  const sessionStateStore = new SessionStateStore(redis);
  const proxyManager = new ProxyManager(env.PROXY_BASE_DOMAIN, redis);

  const deferredPublisher = new DeferredPublisher();

  const browserService = new BrowserServiceManager(
    {
      apiUrl: env.BROWSER_API_URL,
      wsHost: env.BROWSER_WS_HOST,
      cleanupDelayMs: env.BROWSER_CLEANUP_DELAY_MS,
      reconcileIntervalMs: env.RECONCILE_INTERVAL_MS,
      maxRetries: env.MAX_DAEMON_RETRIES,
      proxyContainerName: env.PROXY_CONTAINER_NAME,
      proxyPort: env.PROXY_PORT,
      proxyBaseDomain: env.PROXY_BASE_DOMAIN,
    },
    deferredPublisher,
  );

  const sessionLifecycle = new SessionLifecycleManager(
    sandbox,
    proxyManager,
    browserService,
    deferredPublisher,
    sessionStateStore,
  );

  const logMonitor = new LogMonitor(sandbox, deferredPublisher);
  const containerMonitor = new ContainerMonitor(sandbox, deferredPublisher);
  const openCodeMonitor = new OpenCodeMonitor(opencode, deferredPublisher, sessionStateStore);

  const promptService = createDefaultPromptService();
  const imageStore = createImageStoreFromEnv();

  const poolManager = new PoolManager(env.POOL_SIZE, browserService, sessionLifecycle);

  const server = new ApiServer(
    {
      proxyBaseDomain: env.PROXY_BASE_DOMAIN,
      opencodeUrl: env.OPENCODE_URL,
      github: {
        clientId: env.GITHUB_CLIENT_ID,
        clientSecret: env.GITHUB_CLIENT_SECRET,
        callbackUrl: env.GITHUB_CALLBACK_URL,
      },
      frontendUrl: env.FRONTEND_URL,
    },
    {
      browserService,
      sessionLifecycle,
      poolManager,
      logMonitor,
      sandbox,
      opencode,
      promptService,
      imageStore,
      widelog,
      sessionStateStore,
    },
  );

  return {
    server,
    redis,
    deferredPublisher,
    browserService,
    sessionLifecycle,
    poolManager,
    logMonitor,
    containerMonitor,
    openCodeMonitor,
    networkReconcileMonitor: new NetworkReconcileMonitor(sandbox, [
      env.BROWSER_CONTAINER_NAME,
      env.PROXY_CONTAINER_NAME,
      env.OPENCODE_CONTAINER_NAME,
    ]),
  };
}) satisfies SetupFunction;
