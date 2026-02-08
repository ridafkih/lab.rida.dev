import type { Handler, NoRouteContext } from "../../../types/route";
import { getGitHubCredentials } from "../../../repositories/github-settings.repository";
import { NotFoundError } from "../../../shared/errors";
import { widelog } from "../../../logging";

const GET: Handler<NoRouteContext> = async () => {
  widelog.set("github.action", "get_credentials");
  const credentials = await getGitHubCredentials();
  widelog.set("github.has_credentials", !!credentials?.token);

  if (!credentials?.token) {
    throw new NotFoundError("GitHub credentials");
  }

  return Response.json({
    token: credentials.token,
    username: credentials.username,
  });
};

export { GET };
