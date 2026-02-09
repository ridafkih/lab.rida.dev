import { type } from "arktype";

export const env = type({
  MCP_PORT: "string.integer.parse",
  API_BASE_URL: "string",
  BROWSER_DAEMON_URL: "string",
  BROWSER_CONTAINER_NAME: "string",
  RUSTFS_ENDPOINT: "string",
  RUSTFS_ACCESS_KEY: "string",
  RUSTFS_SECRET_KEY: "string",
  RUSTFS_BUCKET: "string",
  RUSTFS_PUBLIC_URL: "string",
  RUSTFS_REGION: "string = 'us-east-1'",
});
