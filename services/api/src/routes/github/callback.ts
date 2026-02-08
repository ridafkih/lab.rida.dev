import type { Handler, GithubContext } from "../../types/route";
import { validateState } from "./auth";
import { saveGitHubOAuthToken } from "../../repositories/github-settings.repository";
import { widelog } from "../../logging";

interface GitHubTokenResponse {
  access_token?: string;
  scope?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
}

interface GitHubUserResponse {
  login: string;
  name?: string;
  email?: string;
}

function redirectToSettings(frontendUrl: string, params: Record<string, string>): Response {
  const search = new URLSearchParams({ tab: "github", ...params });
  return Response.redirect(`${frontendUrl}/settings?${search.toString()}`, 302);
}

const GET: Handler<GithubContext> = async (request, _params, ctx) => {
  widelog.set("github.action", "oauth_callback");

  if (!ctx.frontendUrl) {
    return Response.json({ error: "FRONTEND_URL is not configured" }, { status: 500 });
  }

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  const errorDescription = url.searchParams.get("error_description");

  const frontendUrl = ctx.frontendUrl;

  if (error) {
    return redirectToSettings(frontendUrl, { error: errorDescription || error });
  }

  if (!code || !state) {
    return redirectToSettings(frontendUrl, { error: "Missing code or state parameter" });
  }

  if (!validateState(state)) {
    return redirectToSettings(frontendUrl, { error: "Invalid or expired state parameter" });
  }

  if (!ctx.githubClientId || !ctx.githubClientSecret) {
    return redirectToSettings(frontendUrl, { error: "GitHub OAuth is not configured" });
  }

  try {
    const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        client_id: ctx.githubClientId,
        client_secret: ctx.githubClientSecret,
        code,
      }),
    });

    const tokenData: GitHubTokenResponse = await tokenResponse.json();

    if (tokenData.error || !tokenData.access_token) {
      return redirectToSettings(frontendUrl, {
        error: tokenData.error_description || tokenData.error || "Failed to get access token",
      });
    }

    const userResponse = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });

    if (!userResponse.ok) {
      return redirectToSettings(frontendUrl, { error: "Failed to fetch GitHub user info" });
    }

    const userData: GitHubUserResponse = await userResponse.json();

    await saveGitHubOAuthToken({
      accessToken: tokenData.access_token,
      scopes: tokenData.scope || "",
      username: userData.login,
    });

    widelog.set("github.oauth_callback_outcome", "success");
    widelog.set("github.username", userData.login);
    return redirectToSettings(frontendUrl, { connected: "true" });
  } catch (err) {
    widelog.errorFields(err, { prefix: "github.oauth_callback_error" });
    widelog.set("github.oauth_callback_outcome", "error");
    return redirectToSettings(frontendUrl, { error: "An unexpected error occurred" });
  }
};

export { GET };
