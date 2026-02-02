import {
  setWorkspaceContainer,
  clearWorkspaceContainer,
} from "../../../../utils/repositories/container.repository";
import { badRequestResponse, noContentResponse } from "../../../../shared/http";
import type { RouteHandler } from "../../../../utils/handlers/route-handler";

const PATCH: RouteHandler = async (request, params) => {
  const projectId = Array.isArray(params.projectId) ? params.projectId[0] : params.projectId;
  const containerId = params.containerId;
  const body = await request.json();

  if (typeof body.isWorkspace === "boolean") {
    if (body.isWorkspace) {
      await setWorkspaceContainer(projectId, containerId);
    } else {
      await clearWorkspaceContainer(projectId);
    }
    return noContentResponse();
  }

  return badRequestResponse("Invalid request body");
};

export { PATCH };
