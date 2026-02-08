import { widelog } from "../logging";
import { apiClient } from "../clients/api";
import { sessionTracker } from "./session-tracker";
import { responseSubscriber } from "./response-subscriber";
import type { IncomingPlatformMessage, MessagingMode, PlatformType } from "../types/messages";
import { getAdapter } from "../platforms";

export class MessageRouter {
  async handleIncomingMessage(message: IncomingPlatformMessage): Promise<void> {
    const { platform, chatId, userId, messageId, content, timestamp } = message;

    return widelog.context(async () => {
      widelog.set("event_name", "message_router.message_handled");
      widelog.set("platform", platform);
      widelog.set("chat_id", chatId);
      widelog.time.start("duration_ms");

      try {
        await this.routeToChatOrchestrator(platform, chatId, userId, messageId, content, timestamp);
        widelog.set("outcome", "success");
      } catch (error) {
        widelog.set("outcome", "error");
        widelog.errorFields(error);
        throw error;
      } finally {
        widelog.time.stop("duration_ms");
        widelog.flush();
      }
    });
  }

  private async routeToChatOrchestrator(
    platform: PlatformType,
    chatId: string,
    userId: string | undefined,
    messageId: string | undefined,
    content: string,
    timestamp: Date,
  ): Promise<void> {
    const adapter = getAdapter(platform);
    const messagingMode: MessagingMode = adapter?.messagingMode ?? "passive";
    widelog.set("messaging_mode", messagingMode);

    let chunkCount = 0;
    const result = await apiClient.chatStream(
      {
        content,
        platformOrigin: platform,
        platformChatId: chatId,
        timestamp: timestamp.toISOString(),
      },
      async (chunkText) => {
        if (adapter) {
          chunkCount++;
          await adapter.sendMessage({
            platform,
            chatId,
            content: chunkText,
          });
        }
      },
    );

    widelog.set("chunk_count", chunkCount);
    widelog.set("action", result.action);

    if (result.action === "created_session" && result.sessionId) {
      widelog.set("session_id", result.sessionId);
      widelog.set("project_name", result.projectName ?? "unknown");

      await sessionTracker.setMapping(platform, chatId, result.sessionId, userId, messageId);
      responseSubscriber.subscribeToSession(
        result.sessionId,
        platform,
        chatId,
        messageId,
        messagingMode,
      );
    }

    if (result.action === "forwarded_message" && result.sessionId) {
      widelog.set("session_id", result.sessionId);
      await sessionTracker.touchMapping(platform, chatId);
    }

    if (adapter && result.attachments?.length) {
      widelog.set("attachment_count", result.attachments.length);
      await adapter.sendMessage({
        platform,
        chatId,
        content: "",
        attachments: result.attachments,
      });
    }
  }
}

export const messageRouter = new MessageRouter();
