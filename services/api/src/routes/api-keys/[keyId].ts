import { db } from "@lab/database/client";
import { apiKey } from "@lab/database/schema/api-keys";
import { and, eq } from "drizzle-orm";
import type { AuthContext, Handler } from "../../types/route";

const DELETE: Handler<AuthContext> = async ({ request, params, context }) => {
  const session = await context.auth.api.getSession({
    headers: request.headers,
  });

  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const keyId = params.keyId;
  if (!keyId) {
    return Response.json({ error: "Key ID is required" }, { status: 400 });
  }

  const deleted = await db
    .delete(apiKey)
    .where(and(eq(apiKey.id, keyId), eq(apiKey.userId, session.user.id)))
    .returning({ id: apiKey.id });

  if (deleted.length === 0) {
    return Response.json({ error: "API key not found" }, { status: 404 });
  }

  return new Response(null, { status: 204 });
};

export { DELETE };
