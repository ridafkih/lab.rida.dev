import { findAllProjectsWithContainers, createProject } from "../repositories/project.repository";
import type { Handler, InfraContext, NoRouteContext } from "../types/route";
import { parseRequestBody } from "../shared/validation";
import { widelog } from "../logging";
import { z } from "zod";

const createProjectSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  systemPrompt: z.string().optional(),
});

const GET: Handler<NoRouteContext> = async () => {
  const projects = await findAllProjectsWithContainers();
  widelog.set("project.count", projects.length);
  return Response.json(projects);
};

const POST: Handler<InfraContext> = async (request, _params, ctx) => {
  const body = await parseRequestBody(request, createProjectSchema);
  const project = await createProject({
    name: body.name,
    description: body.description,
    systemPrompt: body.systemPrompt,
  });

  widelog.set("project.id", project.id);

  ctx.publisher.publishDelta("projects", {
    type: "add",
    project: { id: project.id, name: project.name },
  });

  return Response.json(project, { status: 201 });
};

export { GET, POST };
