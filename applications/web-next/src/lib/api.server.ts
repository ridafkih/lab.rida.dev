import "server-only";
import { createClient } from "@lab/client";

const API_BASE = process.env.NEXT_PUBLIC_API_URL;

if (!API_BASE) {
  throw Error("Must set NEXT_PUBLIC_API_URL");
}

const serverApi = createClient({ baseUrl: API_BASE });

export function prefetchProjects() {
  return serverApi.projects.list();
}

export function prefetchModels() {
  return serverApi.models.list();
}

export function prefetchSessions(projectId: string) {
  return serverApi.sessions.list(projectId);
}
