import type { Handler, GithubContext } from "../../types/route";
import { createHmac, randomBytes } from "node:crypto";
import { TIMING } from "../../config/constants";
import { ConfigurationError } from "../../shared/errors";
import { widelog } from "../../logging";

function getSigningKey(): string {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) {
    throw new ConfigurationError("ENCRYPTION_KEY is required for OAuth state signing");
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
  if (age > TIMING.OAUTH_STATE_EXPIRY_MS || age < 0) return false;

  return true;
}

const GET: Handler<GithubContext> = async (_request, _params, ctx) => {
  widelog.set("github.action", "auth_redirect");

  if (!ctx.githubClientId || !ctx.githubCallbackUrl) {
    throw new ConfigurationError("GitHub OAuth is not configured");
  }

  const state = createState();

  const params = new URLSearchParams({
    client_id: ctx.githubClientId,
    redirect_uri: ctx.githubCallbackUrl,
    scope: "repo",
    state,
  });

  const url = `https://github.com/login/oauth/authorize?${params.toString()}`;
  return Response.redirect(url, 302);
};

export { GET };
