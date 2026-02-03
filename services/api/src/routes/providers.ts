import { opencode } from "../clients/opencode";
import type { RouteHandler } from "../utils/handlers/route-handler";

const GET: RouteHandler = async () => {
  const { data } = await opencode.provider.list();
  return Response.json(data);
};

export { GET };
