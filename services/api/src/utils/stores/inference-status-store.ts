type InferenceStatus = "idle" | "generating";

const statusMap = new Map<string, InferenceStatus>();

export function setInferenceStatus(sessionId: string, status: InferenceStatus): void {
  statusMap.set(sessionId, status);
}

export function getInferenceStatus(sessionId: string): InferenceStatus {
  return statusMap.get(sessionId) ?? "idle";
}

export function clearInferenceStatus(sessionId: string): void {
  statusMap.delete(sessionId);
}
