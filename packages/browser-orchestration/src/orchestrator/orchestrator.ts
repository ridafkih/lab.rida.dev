import { type BrowserSessionState, type SessionSnapshot } from "../types/schema";
import { type StateStore } from "./state-store";
import { type DaemonController } from "./daemon-controller";
import { createReconciler } from "./reconciler";
import { createReconcilerLoop, type ReconcilerLoop } from "./reconciler-loop";
import { createSessionManager, type SessionManager } from "./session-manager";

export interface OrchestratorConfig {
  maxRetries: number;
  reconcileIntervalMs: number;
  cleanupDelayMs: number;
}

export type StateChangeHandler = (sessionId: string, state: BrowserSessionState) => void;
export type ErrorHandler = (error: unknown) => void;

export interface Orchestrator {
  subscribe(sessionId: string): Promise<SessionSnapshot>;
  unsubscribe(sessionId: string): Promise<SessionSnapshot>;
  forceStop(sessionId: string): Promise<void>;
  getSnapshot(sessionId: string): Promise<SessionSnapshot>;
  getCachedFrame(sessionId: string): string | null;
  setCachedFrame(sessionId: string, frame: string): void;
  launchBrowser(sessionId: string): Promise<void>;
  startReconciler(): void;
  stopReconciler(): void;
  onStateChange(handler: StateChangeHandler): void;
  onError(handler: ErrorHandler): void;
}

export const createOrchestrator = (
  stateStore: StateStore,
  daemonController: DaemonController,
  config: OrchestratorConfig,
): Orchestrator => {
  const sessions: SessionManager = createSessionManager();
  const stateChangeHandlers: StateChangeHandler[] = [];
  const errorHandlers: ErrorHandler[] = [];

  const notifyStateChange = (sessionId: string, state: BrowserSessionState) =>
    stateChangeHandlers.forEach((h) => h(sessionId, state));

  const notifyError = (error: unknown) => errorHandlers.forEach((h) => h(error));

  const notifyingStateStore: StateStore = {
    ...stateStore,
    async setCurrentState(sessionId, currentState, options) {
      const state = await stateStore.setCurrentState(sessionId, currentState, options);
      notifyStateChange(sessionId, state);
      return state;
    },
    async setDesiredState(sessionId, desiredState) {
      const state = await stateStore.setDesiredState(sessionId, desiredState);
      notifyStateChange(sessionId, state);
      return state;
    },
  };

  const reconciler = createReconciler(notifyingStateStore, daemonController, {
    maxRetries: config.maxRetries,
  });

  const reconcilerLoop: ReconcilerLoop = createReconcilerLoop(
    reconciler,
    config.reconcileIntervalMs,
    notifyError,
  );

  const getSnapshot = async (sessionId: string): Promise<SessionSnapshot> => {
    const dbState = await stateStore.getState(sessionId);
    const subscriberCount = sessions.getSubscriberCount(sessionId);

    if (!dbState) {
      return { sessionId, desiredState: "stopped", currentState: "stopped", subscriberCount };
    }

    return {
      sessionId: dbState.sessionId,
      desiredState: dbState.desiredState,
      currentState: dbState.currentState,
      streamPort: dbState.streamPort ?? undefined,
      errorMessage: dbState.errorMessage ?? undefined,
      subscriberCount,
    };
  };

  return {
    async subscribe(sessionId) {
      sessions.clearCleanupTimer(sessionId);
      const count = sessions.incrementSubscribers(sessionId);

      if (count === 1) {
        await notifyingStateStore.setDesiredState(sessionId, "running");
      }

      return getSnapshot(sessionId);
    },

    async unsubscribe(sessionId) {
      const count = sessions.decrementSubscribers(sessionId);

      if (count === 0) {
        sessions.setCleanupTimer(
          sessionId,
          async () => {
            if (sessions.getSubscriberCount(sessionId) === 0) {
              sessions.resetSession(sessionId);
              await notifyingStateStore.setDesiredState(sessionId, "stopped");
            }
          },
          config.cleanupDelayMs,
        );
      }

      return getSnapshot(sessionId);
    },

    async forceStop(sessionId) {
      sessions.delete(sessionId);
      await daemonController.stop(sessionId);
      await stateStore.deleteSession(sessionId);
    },

    getSnapshot,

    getCachedFrame: (sessionId) => sessions.getFrame(sessionId),

    setCachedFrame: (sessionId, frame) => sessions.setFrame(sessionId, frame),

    launchBrowser: (sessionId) => daemonController.launch(sessionId),

    startReconciler: () => reconcilerLoop.start(),

    stopReconciler: () => reconcilerLoop.stop(),

    onStateChange: (handler) => stateChangeHandlers.push(handler),

    onError: (handler) => errorHandlers.push(handler),
  };
};
