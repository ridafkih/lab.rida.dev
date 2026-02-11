function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optionalInt(name: string, defaultValue: number): number {
  const value = process.env[name];
  return value ? Number.parseInt(value, 10) : defaultValue;
}

function optionalBool(name: string, defaultValue: boolean): boolean {
  const value = process.env[name];
  if (!value) {
    return defaultValue;
  }
  return value === "true" || value === "1";
}

function optionalList(name: string): string[] {
  const value = process.env[name];
  return value ? value.split(",").filter(Boolean) : [];
}

export const config = {
  apiUrl: required("API_URL"),
  apiWsUrl: required("API_WS_URL"),
  apiKey: required("API_KEY"),
  imessageEnabled: optionalBool("IMESSAGE_ENABLED", true),
  imessageWatchedContacts: optionalList("IMESSAGE_WATCHED_CONTACTS"),
  imessageContextMessages: optionalInt("IMESSAGE_CONTEXT_MESSAGES", 20),
  staleSessionThresholdMs: optionalInt(
    "STALE_SESSION_THRESHOLD_MS",
    86_400_000
  ),
};
