import { publisher } from "../publisher";
import { browserStateManager } from "../browser";

interface BrowserReadyPayload {
  sessionId: string;
  port: number;
  ready: boolean;
}

export async function handleBrowserReadyCallback(request: Request): Promise<Response> {
  try {
    const payload: BrowserReadyPayload = await request.json();
    const { sessionId, port, ready } = payload;

    if (!sessionId || !port) {
      return new Response("Invalid payload", { status: 400 });
    }

    if (ready) {
      // Update state to running in database
      const state = await browserStateManager.setActualState(sessionId, "running", {
        streamPort: port,
      });

      // Publish the updated state to all subscribers
      publisher.publishSnapshot(
        "sessionBrowserStream",
        { uuid: sessionId },
        {
          desiredState: state?.desiredState ?? "running",
          actualState: state?.actualState ?? "running",
          streamPort: state?.streamPort ?? port,
          errorMessage: state?.errorMessage ?? undefined,
        },
      );
    }

    return new Response("OK", { status: 200 });
  } catch (err) {
    console.error("Error handling browser ready callback:", err);
    return new Response("Internal error", { status: 500 });
  }
}
