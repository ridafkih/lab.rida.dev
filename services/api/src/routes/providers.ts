import { widelog } from "../logging";
import type { Handler, InfraContext } from "../types/route";

const GET: Handler<InfraContext> = async ({ context: ctx }) => {
  try {
    const client = await ctx.sandboxAgentResolver.getAnyClient();
    const agents = await client.listAgents();
    widelog.set("agent.count", agents.length);
    return Response.json({ agents });
  } catch (error) {
    widelog.set(
      "agent.list_error",
      error instanceof Error ? error.message : "Unknown"
    );
    return Response.json({ agents: [] });
  }
};

export { GET };
