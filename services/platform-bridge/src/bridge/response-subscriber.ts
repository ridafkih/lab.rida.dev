import { widelog } from "../logging";
import { multiplayerClient } from "../clients/multiplayer";
import { completionListener } from "./completion-listener";
import { getAdapter } from "../platforms";
import type { PlatformType, SessionMessage, MessagingMode } from "../types/messages";

interface SubscriptionInfo {
  platform: PlatformType;
  chatId: string;
  threadId?: string;
  messagingMode: MessagingMode;
  unsubscribe: () => void;
}

export class ResponseSubscriber {
  private subscriptions = new Map<string, SubscriptionInfo>();

  subscribeToSession(
    sessionId: string,
    platform: PlatformType,
    chatId: string,
    threadId: string | undefined,
    messagingMode: MessagingMode = "passive",
  ): void {
    if (this.subscriptions.has(sessionId)) {
      const existing = this.subscriptions.get(sessionId)!;
      if (existing.platform === platform && existing.chatId === chatId) {
        return;
      }
      existing.unsubscribe();
    }

    const unsubscribe = multiplayerClient.subscribeToSession(sessionId, (message) => {
      this.handleSessionMessage(sessionId, message);
    });

    this.subscriptions.set(sessionId, { platform, chatId, threadId, messagingMode, unsubscribe });

    if (messagingMode === "passive") {
      completionListener.subscribeToSession(sessionId);
    }
  }

  unsubscribeFromSession(sessionId: string): void {
    const subscription = this.subscriptions.get(sessionId);
    if (subscription) {
      subscription.unsubscribe();
      if (subscription.messagingMode === "passive") {
        completionListener.unsubscribeFromSession(sessionId);
      }
      this.subscriptions.delete(sessionId);
    }
  }

  private async handleSessionMessage(sessionId: string, message: SessionMessage): Promise<void> {
    if (message.role !== "assistant") return;

    const subscription = this.subscriptions.get(sessionId);
    if (!subscription) return;

    return widelog.context(async () => {
      widelog.set("event_name", "response_subscriber.message_handled");
      widelog.set("session_id", sessionId);
      widelog.set("platform", subscription.platform);
      widelog.set("chat_id", subscription.chatId);

      try {
        if (subscription.messagingMode === "passive") {
          widelog.set("action", "skipped_passive");
          widelog.set("outcome", "success");
          return;
        }

        const adapter = getAdapter(subscription.platform);
        if (!adapter) {
          widelog.set("action", "no_adapter");
          widelog.set("outcome", "error");
          return;
        }

        await adapter.sendMessage({
          platform: subscription.platform,
          chatId: subscription.chatId,
          content: message.content,
          threadId: subscription.threadId,
        });

        widelog.set("action", "sent");
        widelog.set("outcome", "success");
      } catch (error) {
        widelog.set("action", "send_failed");
        widelog.set("outcome", "error");
        widelog.errorFields(error);
      } finally {
        widelog.flush();
      }
    });
  }

  getActiveSubscriptions(): Map<string, { platform: PlatformType; chatId: string }> {
    const result = new Map<string, { platform: PlatformType; chatId: string }>();
    for (const [sessionId, info] of this.subscriptions) {
      result.set(sessionId, { platform: info.platform, chatId: info.chatId });
    }
    return result;
  }

  getThreadId(sessionId: string): string | undefined {
    return this.subscriptions.get(sessionId)?.threadId;
  }

  unsubscribeAll(): void {
    for (const [, subscription] of this.subscriptions) {
      subscription.unsubscribe();
    }
    this.subscriptions.clear();
  }
}

export const responseSubscriber = new ResponseSubscriber();
