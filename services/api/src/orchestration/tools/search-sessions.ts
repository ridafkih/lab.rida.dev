import { tool } from "ai";
import { z } from "zod";
import { searchSessionsWithProject } from "../../repositories/session.repository";
import type { SandboxAgentClientResolver } from "../../sandbox-agent/client-resolver";
import {
  fetchSessionMessages,
  type ReconstructedMessage,
} from "../sandbox-agent-messages";

const inputSchema = z.object({
  query: z.string().describe("The search query to find relevant sessions"),
  limit: z
    .number()
    .optional()
    .default(5)
    .describe("Maximum number of results to return"),
});

interface ScoredResult {
  relevantContent: string;
  score: number;
}

function scoreMessageContent(
  messages: ReconstructedMessage[],
  queryLower: string,
  queryLength: number
): ScoredResult | null {
  for (const msg of messages) {
    const textLower = msg.content.toLowerCase();
    if (textLower.includes(queryLower)) {
      const index = textLower.indexOf(queryLower);
      const start = Math.max(0, index - 50);
      const end = Math.min(msg.content.length, index + queryLength + 50);
      return {
        relevantContent: `...${msg.content.slice(start, end)}...`,
        score: 1.0,
      };
    }
  }
  return null;
}

function scoreRow(
  row: { title: string | null; projectName: string },
  messages: ReconstructedMessage[] | null,
  queryLower: string,
  queryLength: number
): ScoredResult {
  let relevantContent = "";
  let score = 0;

  if (row.title?.toLowerCase().includes(queryLower)) {
    relevantContent = row.title;
    score = 0.8;
  }

  if (row.projectName.toLowerCase().includes(queryLower)) {
    score = Math.max(score, 0.6);
  }

  if (messages) {
    const messageResult = scoreMessageContent(
      messages,
      queryLower,
      queryLength
    );
    if (messageResult) {
      relevantContent = messageResult.relevantContent;
      score = messageResult.score;
    }
  }

  return { relevantContent, score };
}

export function createSearchSessionsTool(
  sandboxAgentResolver: SandboxAgentClientResolver
) {
  return tool({
    description:
      "Searches across session titles and conversation content to find relevant sessions. Returns matching sessions with relevant content snippets.",
    inputSchema,

    execute: async ({ query, limit }) => {
      const searchLimit = limit ?? 5;

      const rows = await searchSessionsWithProject({ query, limit });

      const messagePromises = rows.map(async (row) => {
        if (!row.sandboxSessionId) {
          return null;
        }
        try {
          return await fetchSessionMessages(
            sandboxAgentResolver,
            row.id,
            row.sandboxSessionId
          );
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

      for (const [i, row] of rows.entries()) {
        if (results.length >= searchLimit) {
          break;
        }

        const { relevantContent, score } = scoreRow(
          row,
          allMessages[i] ?? null,
          queryLower,
          query.length
        );

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
