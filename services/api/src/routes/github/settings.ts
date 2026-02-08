import type { Handler, NoRouteContext } from "../../types/route";
import {
  getGitHubSettings,
  saveGitHubSettings,
  deleteGitHubSettings,
} from "../../repositories/github-settings.repository";
import { parseRequestBody } from "../../shared/validation";
import { noContentResponse } from "@lab/http-utilities";
import { widelog } from "../../logging";
import { z } from "zod";

const settingsSchema = z.object({
  pat: z.string().optional(),
  username: z.string().optional(),
  authorName: z.string().optional(),
  authorEmail: z.string().optional(),
  attributeAgent: z.boolean().optional(),
});

const GET: Handler<NoRouteContext> = async () => {
  widelog.set("github.action", "get_settings");
  const settings = await getGitHubSettings();
  widelog.set("github.configured", !!settings);
  if (!settings) {
    return Response.json({ configured: false });
  }
  return Response.json({ configured: true, ...settings });
};

const POST: Handler<NoRouteContext> = async (request) => {
  widelog.set("github.action", "save_settings");
  const body = await parseRequestBody(request, settingsSchema);

  const settings = await saveGitHubSettings({
    pat: body.pat,
    username: body.username,
    authorName: body.authorName,
    authorEmail: body.authorEmail,
    attributeAgent: body.attributeAgent,
  });

  return Response.json(settings, { status: 201 });
};

const DELETE: Handler<NoRouteContext> = async () => {
  widelog.set("github.action", "delete_settings");
  await deleteGitHubSettings();
  return noContentResponse();
};

export { GET, POST, DELETE };
