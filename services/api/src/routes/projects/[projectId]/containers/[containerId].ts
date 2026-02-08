import {
  setWorkspaceContainer,
  clearWorkspaceContainer,
} from "../../../../repositories/container-session.repository";
import { noContentResponse } from "@lab/http-utilities";
import { withParams } from "../../../../shared/route-helpers";
import { parseRequestBody } from "../../../../shared/validation";
import { widelog } from "../../../../logging";
import { z } from "zod";

const setWorkspaceSchema = z.object({
  isWorkspace: z.boolean(),
});

const PATCH = withParams<{ projectId: string; containerId: string }>(
  ["projectId", "containerId"],
  async ({ projectId, containerId }, request) => {
    widelog.set("project.id", projectId);
    widelog.set("container.id", containerId);
    const body = await parseRequestBody(request, setWorkspaceSchema);

    widelog.set("container.is_workspace", body.isWorkspace);

    if (body.isWorkspace) {
      await setWorkspaceContainer(projectId, containerId);
    } else {
      await clearWorkspaceContainer(projectId);
    }
    return noContentResponse();
  },
);

export { PATCH };
