import {
  findContainersWithDependencies,
  createContainer,
  createContainerPorts,
  createContainerDependencies,
  validateDependencies,
} from "../../../utils/repositories/container.repository";
import type { RouteHandler } from "../../../utils/handlers/route-handler";

interface DependencyInput {
  containerId: string;
  condition?: string;
}

type DependsOnInput = (DependencyInput | string)[];

function normalizeDependencies(
  dependsOn: DependsOnInput | undefined,
): { dependsOnContainerId: string; condition?: string }[] {
  if (!dependsOn || !Array.isArray(dependsOn)) {
    return [];
  }

  return dependsOn.map((dependency) => {
    if (typeof dependency === "string") {
      return { dependsOnContainerId: dependency };
    }
    return {
      dependsOnContainerId: dependency.containerId,
      condition: dependency.condition,
    };
  });
}

function extractDependsOnIds(
  dependencies: { dependsOnContainerId: string; condition?: string }[],
): string[] {
  return dependencies.map((dependency) => dependency.dependsOnContainerId);
}

const GET: RouteHandler = async (_request, params) => {
  const containers = await findContainersWithDependencies(params.projectId);
  return Response.json(containers);
};

const POST: RouteHandler = async (request, params) => {
  const body = await request.json();
  const container = await createContainer({
    projectId: params.projectId,
    image: body.image,
    hostname: body.hostname,
  });

  if (body.ports && Array.isArray(body.ports) && body.ports.length > 0) {
    await createContainerPorts(container.id, body.ports);
  }

  const normalizedDependencies = normalizeDependencies(body.dependsOn);

  if (normalizedDependencies.length > 0) {
    const dependsOnIds = extractDependsOnIds(normalizedDependencies);
    const validation = await validateDependencies(params.projectId, container.id, dependsOnIds);

    if (!validation.valid) {
      return Response.json({ error: validation.errors.join(", ") }, { status: 400 });
    }

    await createContainerDependencies(container.id, normalizedDependencies);
  }

  return Response.json(
    {
      ...container,
      dependencies: normalizedDependencies.map((dependency) => ({
        dependsOnContainerId: dependency.dependsOnContainerId,
        condition: dependency.condition || "service_started",
      })),
    },
    { status: 201 },
  );
};

export { GET, POST };
