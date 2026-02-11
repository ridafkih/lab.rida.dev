export interface SidecarProvider {
  spawnForSession(sessionId: string): Promise<void>;
  destroyForSession(sessionId: string): Promise<void>;
}
