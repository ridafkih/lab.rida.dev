export interface WorkspaceManagerConfig {
  workspacesVolume: string;
  workspacesMount: string;
}

export interface WorkspaceManager {
  startWorkspace(workspacePath: string, image: string): Promise<string>;
  removeWorkspace(workspacePath: string): Promise<void>;
}
