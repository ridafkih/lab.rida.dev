import { type BrowserSessionState, type CurrentState } from "../types/schema";
import { computeRequiredAction, type Action } from "../types/state";
import { type StateStore, type StateStoreOptions } from "./state-store";
import { type DaemonController } from "./daemon-controller";

export interface ReconcilerConfig {
  maxRetries: number;
}

export interface Reconciler {
  reconcileSession(session: BrowserSessionState): Promise<void>;
  reconcileAll(): Promise<void>;
}

export const createReconciler = (
  stateStore: StateStore,
  daemonController: DaemonController,
  config: ReconcilerConfig,
): Reconciler => {
  const updateCurrentState = (
    sessionId: string,
    currentState: CurrentState,
    options: StateStoreOptions = {},
  ): Promise<BrowserSessionState> => {
    return stateStore.setCurrentState(sessionId, currentState, options);
  };

  const startSession = async (session: BrowserSessionState): Promise<void> => {
    const { sessionId, retryCount } = session;

    if (retryCount >= config.maxRetries) return;

    await updateCurrentState(sessionId, "starting", {
      retryCount: retryCount + 1,
      errorMessage: null,
    });

    try {
      const { port } = await daemonController.start(sessionId, session.lastUrl ?? undefined);
      await updateCurrentState(sessionId, "starting", { streamPort: port });
    } catch (error) {
      await updateCurrentState(sessionId, "stopped", {
        streamPort: null,
        errorMessage: error instanceof Error ? error.message : "Failed to start daemon",
      });
    }
  };

  const stopSession = async (session: BrowserSessionState): Promise<void> => {
    const { sessionId } = session;

    const currentUrl = await daemonController.getCurrentUrl(sessionId);
    if (currentUrl && currentUrl !== "about:blank") {
      await stateStore.setLastUrl(sessionId, currentUrl);
    }

    await updateCurrentState(sessionId, "stopping");
    await daemonController.stop(sessionId);

    await updateCurrentState(sessionId, "stopped", {
      streamPort: null,
      errorMessage: null,
      retryCount: 0,
    });
  };

  const checkDaemonReady = async (session: BrowserSessionState): Promise<void> => {
    const { sessionId } = session;

    const status = await daemonController.getStatus(sessionId);
    if (!status?.ready) return;

    await updateCurrentState(sessionId, "running", { streamPort: status.port });

    if (session.lastUrl && session.lastUrl !== "about:blank") {
      await daemonController.navigate(sessionId, session.lastUrl);
    }
  };

  const checkDaemonAlive = async (session: BrowserSessionState): Promise<void> => {
    const { sessionId } = session;

    const status = await daemonController.getStatus(sessionId);
    if (!status?.running) {
      await updateCurrentState(sessionId, "stopped");
    }
  };

  const checkStoppingComplete = async (session: BrowserSessionState): Promise<void> => {
    const { sessionId } = session;

    const status = await daemonController.getStatus(sessionId);
    if (!status?.running) {
      await updateCurrentState(sessionId, "stopped");
    }
  };

  const resetToStopped = async (session: BrowserSessionState): Promise<void> => {
    const { sessionId } = session;

    await updateCurrentState(sessionId, "stopped", {
      streamPort: null,
      errorMessage: null,
    });
  };

  const executeAction = async (session: BrowserSessionState, action: Action): Promise<void> => {
    switch (action) {
      case "StartDaemon":
        return startSession(session);
      case "StopDaemon":
        return stopSession(session);
      case "WaitForReady":
        if (session.currentState === "starting") return checkDaemonReady(session);
        if (session.currentState === "stopping") return checkStoppingComplete(session);
        if (session.currentState === "running") return checkDaemonAlive(session);
        return;
      case "ResetToStopped":
        return resetToStopped(session);
      case "NoOp":
        return;
    }
  };

  const reconcileSession = async (session: BrowserSessionState): Promise<void> => {
    const action = computeRequiredAction(session.desiredState, session.currentState);
    await executeAction(session, action);
  };

  const reconcileAll = async (): Promise<void> => {
    const sessions = await stateStore.getAllSessions();
    const errors: Array<{ sessionId: string; error: unknown }> = [];

    for (const session of sessions) {
      try {
        await reconcileSession(session);
      } catch (error) {
        errors.push({ sessionId: session.sessionId, error });
      }
    }

    if (errors.length > 0) {
      throw new AggregateError(
        errors.map((e) => e.error),
        `Reconciliation failed for ${errors.length} session(s): ${errors.map((e) => e.sessionId).join(", ")}`,
      );
    }
  };

  return { reconcileSession, reconcileAll };
};
