import { type } from "arktype";

export const env = type({
  API_PORT: "string",
  OPENCODE_URL: "string",
  BROWSER_API_URL: "string",
  BROWSER_WS_HOST: "string = 'browser'",
  BROWSER_CLEANUP_DELAY_MS: "string.integer.parse = '10000'",
  RECONCILE_INTERVAL_MS: "string.integer.parse = '5000'",
  MAX_DAEMON_RETRIES: "string.integer.parse = '3'",
  BROWSER_SOCKET_VOLUME: "string = 'lab_browser_sockets'",
  BROWSER_CONTAINER_NAME: "string",
  OPENCODE_CONTAINER_NAME: "string",
  PROXY_CONTAINER_NAME: "string",
  PROXY_BASE_DOMAIN: "string",
  PROXY_PORT: "string.integer.parse = '8080'",
  POOL_SIZE: "string.integer.parse = '0'",
  GITHUB_CLIENT_ID: "string?",
  GITHUB_CLIENT_SECRET: "string?",
  GITHUB_CALLBACK_URL: "string?",
  FRONTEND_URL: "string?",
  REDIS_URL: "string = 'redis://localhost:6379'",
});
