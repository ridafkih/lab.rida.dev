import { z } from "zod";
import { tool } from "ai";
import { findSessionsWithProject } from "../../repositories/session.repository";

const inputSchema = z.object({
  projectId: z.string().optional().describe("Optional project ID to filter sessions by"),
  limit: z.number().optional().default(10).describe("Maximum number of sessions to return"),
});

export const listSessionsTool = tool({
  description:
    "Lists recent sessions, optionally filtered by project. Returns session ID, project name, title, status, and creation time.",
  inputSchema,
  execute: async ({ projectId, limit }) => {
    const rows = await findSessionsWithProject({ projectId, limit });

    return {
      sessions: rows.map((row) => ({
        id: row.id,
        projectId: row.projectId,
        projectName: row.projectName,
        title: row.title,
        status: row.status,
        createdAt: row.createdAt?.toISOString(),
      })),
    };
  },
});
