function getRequiredEnv(key: string): string {
  const value = process.env[key];
  if (value === undefined || value === "") {
    throw new Error(`${key} environment variable is required`);
  }
  return value;
}

function getOptionalEnv(key: string, defaultValue?: string): string | undefined {
  const value = process.env[key];
  if (value === undefined || value === "") {
    return defaultValue;
  }
  return value;
}

function getOptionalEnvInt(key: string, defaultValue: number): number {
  const value = process.env[key];
  if (value === undefined || value === "") {
    return defaultValue;
  }
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) {
    throw new Error(`${key} must be a valid integer`);
  }
  return parsed;
}

export const config = {
  apiPort: getRequiredEnv("API_PORT"),
  opencodeUrl: getRequiredEnv("OPENCODE_URL"),
  browserApiUrl: getRequiredEnv("BROWSER_API_URL"),
  browserWsHost: getOptionalEnv("BROWSER_WS_HOST", "browser") ?? "browser",
  browserCleanupDelayMs: getOptionalEnvInt("BROWSER_CLEANUP_DELAY_MS", 10000),
  browserReconcileIntervalMs: getOptionalEnvInt("RECONCILE_INTERVAL_MS", 5000),
  browserMaxRetries: getOptionalEnvInt("MAX_DAEMON_RETRIES", 3),
  browserSocketVolume:
    getOptionalEnv("BROWSER_SOCKET_VOLUME", "lab_browser_sockets") ?? "lab_browser_sockets",
  browserContainerName: getOptionalEnv("BROWSER_CONTAINER_NAME"),
  opencodeContainerName: getOptionalEnv("OPENCODE_CONTAINER_NAME"),
  proxyContainerName: getOptionalEnv("PROXY_CONTAINER_NAME"),
  proxyBaseDomain: getRequiredEnv("PROXY_BASE_DOMAIN"),
  poolSize: getOptionalEnvInt("POOL_SIZE", 0),
  githubClientId: getOptionalEnv("GITHUB_CLIENT_ID"),
  githubClientSecret: getOptionalEnv("GITHUB_CLIENT_SECRET"),
  githubCallbackUrl: getOptionalEnv("GITHUB_CALLBACK_URL"),
  frontendUrl: getOptionalEnv("FRONTEND_URL"),
};

export type Config = typeof config;
