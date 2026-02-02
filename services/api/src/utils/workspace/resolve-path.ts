import { formatWorkspacePath, formatContainerWorkspacePath } from "../../types/session";
import {
  getWorkspaceContainerId,
  getWorkspaceContainerIdByProjectId,
} from "../repositories/container.repository";
import { findSessionById } from "../repositories/session.repository";

export async function resolveWorkspacePathBySession(sessionId: string): Promise<string> {
  const workspaceContainerId = await getWorkspaceContainerId(sessionId);
  if (workspaceContainerId) {
    return formatContainerWorkspacePath(sessionId, workspaceContainerId);
  }
  return formatWorkspacePath(sessionId);
}

export async function resolveWorkspacePathByProject(
  sessionId: string,
  projectId: string,
): Promise<string> {
  const workspaceContainerId = await getWorkspaceContainerIdByProjectId(projectId);
  if (workspaceContainerId) {
    return formatContainerWorkspacePath(sessionId, workspaceContainerId);
  }
  return formatWorkspacePath(sessionId);
}

export async function resolveWorkspacePath(sessionId: string): Promise<string> {
  const session = await findSessionById(sessionId);
  if (session) {
    return resolveWorkspacePathByProject(sessionId, session.projectId);
  }
  return formatWorkspacePath(sessionId);
}
