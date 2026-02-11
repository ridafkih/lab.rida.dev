import { createImageStoreFromEnv } from "@lab/context";
import {
  DockerClient,
  DockerNetworkManager,
  DockerRuntimeManager,
  DockerSessionManager,
  DockerWorkspaceManager,
} from "@lab/sandbox-docker";
import { Sandbox } from "@lab/sandbox-sdk";
import { RedisClient } from "bun";
import { createAuth } from "./auth";
import { ApiServer } from "./clients/server";
import type { env } from "./env";
import { widelog } from "./logging";
import { BrowserServiceManager } from "./managers/browser-service.manager";
import { PoolManager } from "./managers/pool.manager";
import { SessionLifecycleManager } from "./managers/session-lifecycle.manager";
import { ContainerMonitor } from "./monitors/container.monitor";
import { LogMonitor } from "./monitors/log.monitor";
import { NetworkReconcileMonitor } from "./monitors/network-reconcile.monitor";
import { SandboxAgentMonitor } from "./monitors/sandbox-agent.monitor";
import { createDefaultPromptService } from "./prompts/builder";
import { SandboxAgentClientResolver } from "./sandbox-agent/client-resolver";
import { SandboxAgentContainerManager } from "./sandbox-agent/container-manager";
import { ProxyManager } from "./services/proxy.service";
import { DeferredPublisher } from "./shared/deferred-publisher";
import { SessionStateStore } from "./state/session-state-store";

interface SetupOptions {
  env: (typeof env)["inferOut"];
}

type SetupFunction = (options: SetupOptions) => void;

export const setup = (({ env }) => {
  const dockerClient = new DockerClient();
  const sharedContainerNames = [
    env.BROWSER_CONTAINER_NAME,
    env.PROXY_CONTAINER_NAME,
  ];

  const workspaceUtilityContainer =
    dockerClient.createWorkspaceUtilityContainer(
      "lab_session_workspaces",
      "/workspaces"
    );

  const sandbox = new Sandbox(dockerClient, {
    network: new DockerNetworkManager(dockerClient),
    workspace: new DockerWorkspaceManager(
      dockerClient,
      {
        workspacesVolume: "lab_session_workspaces",
        workspacesMount: "/workspaces",
      },
      workspaceUtilityContainer
    ),
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

  const sandboxAgentContainerManager = new SandboxAgentContainerManager(
    dockerClient,
    env.ANTHROPIC_API_KEY
  );
  const sandboxAgentResolver = new SandboxAgentClientResolver(
    sandboxAgentContainerManager
  );

  const redis = new RedisClient(env.REDIS_URL);
  const sessionStateStore = new SessionStateStore(redis);
  const proxyManager = new ProxyManager(env.PROXY_BASE_URL, redis);

  const deferredPublisher = new DeferredPublisher();

  const browserService = new BrowserServiceManager(
    {
      apiUrl: env.BROWSER_API_URL,
      wsUrl: env.BROWSER_WS_URL,
      containerScheme: env.CONTAINER_SCHEME,
      cleanupDelayMs: env.BROWSER_CLEANUP_DELAY_MS,
      reconcileIntervalMs: env.RECONCILE_INTERVAL_MS,
      maxRetries: env.MAX_DAEMON_RETRIES,
      proxyInternalUrl: env.PROXY_INTERNAL_URL,
      proxyBaseUrl: env.PROXY_BASE_URL,
    },
    deferredPublisher
  );

  const sidecarProviders = [sandboxAgentContainerManager];

  const sessionLifecycle = new SessionLifecycleManager(
    sandbox,
    proxyManager,
    browserService,
    deferredPublisher,
    sessionStateStore,
    sidecarProviders
  );

  const logMonitor = new LogMonitor(sandbox, deferredPublisher);
  const containerMonitor = new ContainerMonitor(sandbox, deferredPublisher);
  const sandboxAgentMonitor = new SandboxAgentMonitor(
    sandboxAgentResolver,
    deferredPublisher,
    sessionStateStore
  );

  const promptService = createDefaultPromptService();
  const imageStore = createImageStoreFromEnv();

  const poolManager = new PoolManager(
    env.POOL_SIZE,
    browserService,
    sessionLifecycle
  );

  const trustedOrigins = env.FRONTEND_URL ? [env.FRONTEND_URL] : [];
  const auth = createAuth({
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    githubClientId: env.AUTH_GITHUB_CLIENT_ID,
    githubClientSecret: env.AUTH_GITHUB_CLIENT_SECRET,
    trustedOrigins,
  });

  const server = new ApiServer(
    {
      proxyBaseUrl: env.PROXY_BASE_URL,
      github: {
        clientId: env.GITHUB_CLIENT_ID,
        clientSecret: env.GITHUB_CLIENT_SECRET,
        callbackUrl: env.GITHUB_CALLBACK_URL,
      },
      frontendUrl: env.FRONTEND_URL,
      auth,
    },
    {
      browserService,
      sessionLifecycle,
      poolManager,
      logMonitor,
      sandbox,
      sandboxAgentResolver,
      sandboxAgentContainerManager,
      promptService,
      imageStore,
      widelog,
      sessionStateStore,
    }
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
    sandboxAgentMonitor,
    networkReconcileMonitor: new NetworkReconcileMonitor(sandbox, [
      env.BROWSER_CONTAINER_NAME,
      env.PROXY_CONTAINER_NAME,
    ]),
  };
}) satisfies SetupFunction;
