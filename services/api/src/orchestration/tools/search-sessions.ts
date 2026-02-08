import { z } from "zod";
import { tool } from "ai";
import { searchSessionsWithProject } from "../../repositories/session.repository";
import { resolveWorkspacePathBySession } from "../../shared/path-resolver";
import { isOpencodeMessage, extractTextFromParts } from "../opencode-messages";
import type { OpencodeClient } from "../../types/dependencies";

const inputSchema = z.object({
  query: z.string().describe("The search query to find relevant sessions"),
  limit: z.number().optional().default(5).describe("Maximum number of results to return"),
});

export function createSearchSessionsTool(opencode: OpencodeClient) {
  return tool({
    description:
      "Searches across session titles and conversation content to find relevant sessions. Returns matching sessions with relevant content snippets.",
    inputSchema,
    execute: async ({ query, limit }) => {
      const searchLimit = limit ?? 5;

      const rows = await searchSessionsWithProject({ query, limit });

      const messagePromises = rows.map(async (row) => {
        if (!row.opencodeSessionId) return null;
        try {
          const directory = await resolveWorkspacePathBySession(row.id);
          const response = await opencode.session.messages({
            sessionID: row.opencodeSessionId,
            directory,
          });
          return response.data ?? [];
        } catch {
          return null;
        }
      });

      const allMessages = await Promise.all(messagePromises);
      const queryLower = query.toLowerCase();

      const results: Array<{
        sessionId: string;
        projectName: string;
        title: string | null;
        relevantContent: string;
        score: number;
      }> = [];

      for (let i = 0; i < rows.length; i++) {
        if (results.length >= searchLimit) break;

        const row = rows[i]!;
        let relevantContent = "";
        let score = 0;

        if (row.title?.toLowerCase().includes(queryLower)) {
          relevantContent = row.title;
          score = 0.8;
        }

        if (row.projectName.toLowerCase().includes(queryLower)) {
          score = Math.max(score, 0.6);
        }

        const rawMessages = allMessages[i];
        if (rawMessages) {
          const messages = Array.isArray(rawMessages) ? rawMessages.filter(isOpencodeMessage) : [];

          for (const msg of messages) {
            const text = extractTextFromParts(msg.parts);
            if (text.toLowerCase().includes(queryLower)) {
              const index = text.toLowerCase().indexOf(queryLower);
              const start = Math.max(0, index - 50);
              const end = Math.min(text.length, index + query.length + 50);
              relevantContent = "..." + text.slice(start, end) + "...";
              score = 1.0;
              break;
            }
          }
        }

        if (score > 0) {
          results.push({
            sessionId: row.id,
            projectName: row.projectName,
            title: row.title,
            relevantContent,
            score,
          });
        }
      }

      results.sort((a, b) => b.score - a.score);

      return { results: results.slice(0, searchLimit) };
    },
  });
}
