import { widelog } from "../logging";
import type { Handler, InfraContext } from "../types/route";

const GET: Handler<InfraContext> = async ({ context: ctx }) => {
  try {
    const client = await ctx.sandboxAgentResolver.getAnyClient();
    const models = await client.listModels("claude");

    widelog.set("model.count", models.length);
    return Response.json({
      models: models
        .map((model) => ({
          modelId: model.id,
          name: model.name,
        }))
        .sort((left, right) => left.name.localeCompare(right.name)),
    });
  } catch (error) {
    widelog.set(
      "model.list_error",
      error instanceof Error ? error.message : "Unknown"
    );
    return Response.json({ models: [] });
  }
};

export { GET };
