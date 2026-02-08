import type { Handler, NoRouteContext } from "../../types/route";
import { clearGitHubOAuthToken } from "../../repositories/github-settings.repository";
import { widelog } from "../../logging";

const POST: Handler<NoRouteContext> = async () => {
  widelog.set("github.action", "disconnect");
  await clearGitHubOAuthToken();
  return Response.json({ success: true });
};

export { POST };
