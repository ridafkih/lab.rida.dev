import type { Event } from "@opencode-ai/sdk/client";

export function getSessionIdFromEvent(event: Event): string | undefined {
  if (!("properties" in event)) {
    return undefined;
  }

  const properties = event.properties;

  if ("sessionID" in properties && typeof properties.sessionID === "string") {
    return properties.sessionID;
  }

  if ("info" in properties && typeof properties.info === "object" && properties.info !== null) {
    const info = properties.info;
    if ("sessionID" in info && typeof info.sessionID === "string") {
      return info.sessionID;
    }
    if ("id" in info && typeof info.id === "string") {
      return info.id;
    }
  }

  if ("part" in properties && typeof properties.part === "object" && properties.part !== null) {
    const part = properties.part;
    if ("sessionID" in part && typeof part.sessionID === "string") {
      return part.sessionID;
    }
  }

  return undefined;
}

export function extractErrorMessage(error: unknown): string {
  if (!error || typeof error !== "object") {
    return "Unknown session error";
  }

  if ("data" in error && typeof error.data === "object" && error.data !== null) {
    if ("message" in error.data && typeof error.data.message === "string") {
      return error.data.message;
    }
  }

  return "Unknown session error";
}
