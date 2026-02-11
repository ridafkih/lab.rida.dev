import { LIMITS } from "../config/constants";
import { widelog } from "../logging";
import { complete } from "../orchestration/llm";
import {
  fetchSessionMessages,
  type ReconstructedMessage,
} from "../orchestration/sandbox-agent-messages";
import { findSessionById } from "../repositories/session.repository";
import type { SandboxAgentClientResolver } from "../sandbox-agent/client-resolver";
import { MESSAGE_ROLE } from "../types/message";

interface TaskSummary {
  success: boolean;
  outcome: string;
  summary: string;
}

interface GenerateSummaryOptions {
  sessionId: string;
  originalTask: string;
  platformOrigin?: string;
  sandboxAgentResolver: SandboxAgentClientResolver;
}

function formatConversationForLLM(messages: ReconstructedMessage[]): string {
  return messages
    .map((msg) => {
      const role = msg.role === MESSAGE_ROLE.USER ? "User" : "Assistant";
      return `${role}: ${msg.content}`;
    })
    .join("\n\n");
}

const platformFormatGuidelines: Record<string, string> = {
  imessage:
    "Keep the summary very short (under 200 characters), use plain text only, no markdown or formatting.",
  slack:
    "You may use Slack mrkdwn: *bold*, _italic_. Keep it concise but informative.",
  discord:
    "You may use Discord markdown: **bold**, *italic*. Keep under 500 characters.",
};

function getPlatformGuideline(platform?: string): string {
  if (!platform) {
    return "Keep the summary concise and use plain text.";
  }
  return (
    platformFormatGuidelines[platform.toLowerCase()] ??
    "Keep the summary concise and use plain text."
  );
}

export async function generateTaskSummary(
  options: GenerateSummaryOptions
): Promise<TaskSummary> {
  const { sessionId, originalTask, platformOrigin, sandboxAgentResolver } =
    options;
  const session = await findSessionById(sessionId);

  if (!session?.sandboxSessionId) {
    return {
      success: false,
      outcome: "Session not found",
      summary: "Unable to generate summary - session not found.",
    };
  }

  try {
    const messages = await fetchSessionMessages(
      sandboxAgentResolver,
      sessionId,
      session.sandboxSessionId
    );

    if (messages.length === 0) {
      return {
        success: false,
        outcome: "No conversation history",
        summary: "Unable to generate summary - no conversation history found.",
      };
    }

    const conversationText = formatConversationForLLM(messages);
    const formatGuideline = getPlatformGuideline(platformOrigin);

    const prompt = `You are summarizing the outcome of a task that was delegated to an AI assistant.

Original Task:
${originalTask}

Conversation:
${conversationText}

Based on the conversation above, provide a brief summary of:
1. Whether the task was completed successfully
2. What was accomplished
3. Any issues or notes worth mentioning

Formatting: ${formatGuideline}

Respond in this exact JSON format:
{
  "success": true/false,
  "outcome": "Brief one-line description of what happened",
  "summary": "1-2 sentence summary suitable for sending as a notification message"
}

Only output the JSON, no other text.`;

    const result = await complete(prompt);

    try {
      const parsed = JSON.parse(result);
      return {
        success: Boolean(parsed.success),
        outcome: String(parsed.outcome || "Task processed"),
        summary: String(parsed.summary || "Task completed."),
      };
    } catch {
      return {
        success: true,
        outcome: "Task completed",
        summary: result.slice(0, LIMITS.SUMMARY_FALLBACK_LENGTH),
      };
    }
  } catch (error) {
    widelog.errorFields(error, { prefix: "summary_generator.error" });
    return {
      success: false,
      outcome: "Error generating summary",
      summary: "Task completed, but unable to generate a detailed summary.",
    };
  }
}
