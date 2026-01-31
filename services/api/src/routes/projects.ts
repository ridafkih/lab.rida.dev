import {
  findAllProjectsWithContainers,
  createProject,
} from "../utils/repositories/project.repository";
import { publisher } from "../clients/publisher";
import type { RouteHandler } from "../utils/handlers/route-handler";

const GET: RouteHandler = async () => {
  const projects = await findAllProjectsWithContainers();
  return Response.json(projects);
};

const POST: RouteHandler = async (request) => {
  const body = await request.json();
  const project = await createProject({
    name: body.name,
    systemPrompt: body.systemPrompt,
  });

  publisher.publishDelta("projects", {
    type: "add",
    project: { id: project.id, name: project.name },
  });

  return Response.json(project, { status: 201 });
};

export { GET, POST };
