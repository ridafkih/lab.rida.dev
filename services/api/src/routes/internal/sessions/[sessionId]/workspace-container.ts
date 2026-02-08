import { getWorkspaceContainerRuntimeId } from "../../../../repositories/container-session.repository";
import { formatContainerWorkspacePath } from "../../../../shared/naming";
import { NotFoundError } from "../../../../shared/errors";
import { withParams } from "../../../../shared/route-helpers";
import { widelog } from "../../../../logging";

const GET = withParams<{ sessionId: string }>(["sessionId"], async ({ sessionId }, _request) => {
  widelog.set("session.id", sessionId);
  const result = await getWorkspaceContainerRuntimeId(sessionId);
  widelog.set("container.found", !!result);
  if (!result) throw new NotFoundError("Workspace container");

  return Response.json({
    runtimeId: result.runtimeId,
    workdir: formatContainerWorkspacePath(sessionId, result.containerId),
  });
});

export { GET };
