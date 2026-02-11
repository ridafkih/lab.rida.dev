import { db } from "@lab/database/client";
import { apiKey } from "@lab/database/schema/api-keys";
import { password } from "bun";
import { eq } from "drizzle-orm";
import type { AuthContext, Handler } from "../types/route";

const GET: Handler<AuthContext> = async ({ request, context }) => {
  const session = await context.auth.api.getSession({
    headers: request.headers,
  });

  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const keys = await db
    .select({
      id: apiKey.id,
      name: apiKey.name,
      keyPrefix: apiKey.keyPrefix,
      lastUsedAt: apiKey.lastUsedAt,
      createdAt: apiKey.createdAt,
    })
    .from(apiKey)
    .where(eq(apiKey.userId, session.user.id));

  return Response.json(keys);
};

const POST: Handler<AuthContext> = async ({ request, context }) => {
  const session = await context.auth.api.getSession({
    headers: request.headers,
  });

  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const name = body?.name;

  if (!name || typeof name !== "string") {
    return Response.json({ error: "Name is required" }, { status: 400 });
  }

  const rawKey = `sk-${crypto.randomUUID()}`;
  const keyHash = await password.hash(rawKey);
  const keyPrefix = rawKey.slice(0, 8);
  const id = crypto.randomUUID();

  const [created] = await db
    .insert(apiKey)
    .values({
      id,
      name,
      keyHash,
      keyPrefix,
      userId: session.user.id,
    })
    .returning({
      id: apiKey.id,
      name: apiKey.name,
      keyPrefix: apiKey.keyPrefix,
      lastUsedAt: apiKey.lastUsedAt,
      createdAt: apiKey.createdAt,
    });

  return Response.json({ ...created, key: rawKey }, { status: 201 });
};

export { GET, POST };
