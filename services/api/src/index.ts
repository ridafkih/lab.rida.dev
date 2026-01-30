import { server } from "./server";
import { startContainerMonitor } from "./container-monitor";
import { startOpenCodeMonitor } from "./opencode-monitor";
import { cleanupOrphanedSessions } from "./browser/state-store";

console.log(`API server running on http://localhost:${server.port}`);

cleanupOrphanedSessions().catch((error) => {
  console.warn("[Startup] Failed to cleanup orphaned browser sessions:", error);
});

startContainerMonitor();
startOpenCodeMonitor();
