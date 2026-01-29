import type { UIState } from "./types";

export function createInitialState(): UIState {
  return {
    sessions: new Map(),
    activeSessionId: null,
    pendingPermissions: new Map(),
    connectionStatus: "connecting",
    error: null,
  };
}
