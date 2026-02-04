const lastMessageMap = new Map<string, string>();

export function setLastMessage(sessionId: string, message: string): void {
  if (message) {
    lastMessageMap.set(sessionId, message);
  }
}

export function getLastMessage(sessionId: string): string | undefined {
  return lastMessageMap.get(sessionId);
}

export function clearLastMessage(sessionId: string): void {
  lastMessageMap.delete(sessionId);
}
