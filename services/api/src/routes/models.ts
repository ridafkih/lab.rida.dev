import type { Handler, InfraContext } from "../types/route";
import { ExternalServiceError } from "../shared/errors";
import { widelog } from "../logging";

const GET: Handler<InfraContext> = async (_request, _params, ctx) => {
  const response = await ctx.opencode.provider.list();

  if (response.error || !response.data) {
    throw new ExternalServiceError("Failed to fetch providers", "PROVIDER_LIST_FAILED");
  }

  const { all, connected } = response.data;
  const connectedSet = new Set(connected);

  const models = all
    .filter((provider) => connectedSet.has(provider.id))
    .flatMap((provider) =>
      Object.values(provider.models ?? {}).map((model) => ({
        providerId: provider.id,
        providerName: provider.name,
        modelId: model.id,
        name: model.name,
      })),
    )
    .sort((left, right) => left.name.localeCompare(right.name));

  widelog.set("model.count", models.length);
  widelog.set("model.provider_count", connectedSet.size);
  return Response.json({ models });
};

export { GET };
