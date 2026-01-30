import { BrowserClient } from "./client";
import { browserStateManager } from "./state-manager";
import { clearFrameCache } from "../handlers/browser-stream";

const BROWSER_API_URL = process.env.BROWSER_API_URL;
const CLEANUP_DELAY_MS = parseInt(process.env.BROWSER_CLEANUP_DELAY_MS ?? "10000", 10);

export const browserClient = BROWSER_API_URL ? new BrowserClient(BROWSER_API_URL) : null;

// Track subscriber counts and pending cleanups per session
// These are still in-memory because they track active WebSocket connections
const subscriberCounts = new Map<string, number>();
const pendingCleanups = new Map<string, ReturnType<typeof setTimeout>>();

export async function subscribeToBrowserSession(sessionId: string): Promise<void> {
  // Cancel any pending cleanup
  const pendingCleanup = pendingCleanups.get(sessionId);
  if (pendingCleanup) {
    clearTimeout(pendingCleanup);
    pendingCleanups.delete(sessionId);
  }

  const count = subscriberCounts.get(sessionId) ?? 0;
  subscriberCounts.set(sessionId, count + 1);

  // Set desired state to running on first subscriber
  if (count === 0) {
    try {
      await browserStateManager.subscribe(sessionId);
    } catch (err) {
      console.warn(`Failed to subscribe to browser session ${sessionId}:`, err);
    }
  }
}

export async function unsubscribeFromBrowserSession(sessionId: string): Promise<void> {
  const count = subscriberCounts.get(sessionId) ?? 0;
  if (count <= 0) return;

  const newCount = count - 1;
  subscriberCounts.set(sessionId, newCount);

  // Schedule cleanup when last subscriber leaves
  if (newCount === 0) {
    subscriberCounts.delete(sessionId);

    const timeout = setTimeout(async () => {
      pendingCleanups.delete(sessionId);
      clearFrameCache(sessionId);
      try {
        await browserStateManager.unsubscribe(sessionId);
      } catch (err) {
        console.warn(`Failed to unsubscribe from browser session ${sessionId}:`, err);
      }
    }, CLEANUP_DELAY_MS);

    pendingCleanups.set(sessionId, timeout);
  }
}

export { browserStateManager } from "./state-manager";
