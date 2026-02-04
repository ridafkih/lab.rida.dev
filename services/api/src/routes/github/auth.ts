import type { RouteHandler } from "../../utils/handlers/route-handler";
import { config } from "../../config/environment";
import { createHmac, randomBytes } from "node:crypto";

const STATE_EXPIRY_MS = 10 * 60 * 1000;

function getSigningKey(): string {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) {
    throw new Error("ENCRYPTION_KEY is required for OAuth state signing");
  }
  return key;
}

function createState(): string {
  const nonce = randomBytes(16).toString("hex");
  const timestamp = Date.now().toString();
  const payload = `${nonce}.${timestamp}`;
  const signature = createHmac("sha256", getSigningKey()).update(payload).digest("hex");
  return `${payload}.${signature}`;
}

export function validateState(state: string): boolean {
  const parts = state.split(".");
  if (parts.length !== 3) return false;

  const [nonce, timestamp, signature] = parts;

  if (!nonce || !timestamp || !signature) return false;

  const payload = `${nonce}.${timestamp}`;
  const expectedSignature = createHmac("sha256", getSigningKey()).update(payload).digest("hex");

  if (signature !== expectedSignature) return false;

  const stateTime = parseInt(timestamp, 10);
  if (isNaN(stateTime)) return false;

  const age = Date.now() - stateTime;
  if (age > STATE_EXPIRY_MS || age < 0) return false;

  return true;
}

const GET: RouteHandler = async () => {
  if (!config.githubClientId || !config.githubCallbackUrl) {
    return Response.json({ error: "GitHub OAuth is not configured" }, { status: 500 });
  }

  const state = createState();

  const params = new URLSearchParams({
    client_id: config.githubClientId,
    redirect_uri: config.githubCallbackUrl,
    scope: "repo",
    state,
  });

  const url = `https://github.com/login/oauth/authorize?${params.toString()}`;
  return Response.redirect(url, 302);
};

export { GET };
