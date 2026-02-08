import { widelog } from "../logging";
import { multiplayerClient } from "../clients/multiplayer";
import { apiClient } from "../clients/api";
import { getAdapter } from "../platforms";
import { responseSubscriber } from "./response-subscriber";

interface SessionCompleteEvent {
  sessionId: string;
  completedAt: number;
}

class CompletionListener {
  private processingSet = new Set<string>();
  private unsubscribers = new Map<string, () => void>();

  subscribeToSession(sessionId: string): void {
    if (this.unsubscribers.has(sessionId)) {
      return;
    }

    const unsubscribe = multiplayerClient.subscribeToSessionComplete(sessionId, (event) => {
      this.handleSessionComplete(event);
    });

    this.unsubscribers.set(sessionId, unsubscribe);
  }

  unsubscribeFromSession(sessionId: string): void {
    const unsubscribe = this.unsubscribers.get(sessionId);
    if (unsubscribe) {
      unsubscribe();
      this.unsubscribers.delete(sessionId);
    }
  }

  private async handleSessionComplete(event: SessionCompleteEvent): Promise<void> {
    const { sessionId } = event;

    if (this.processingSet.has(sessionId)) return;

    this.processingSet.add(sessionId);

    return widelog.context(async () => {
      widelog.set("event_name", "completion_listener.session_completed");
      widelog.set("session_id", sessionId);
      widelog.time.start("duration_ms");

      try {
        const subscriptions = responseSubscriber.getActiveSubscriptions();
        const subscription = subscriptions.get(sessionId);

        if (!subscription) {
          widelog.set("outcome", "skipped");
          widelog.set("skip_reason", "no_subscription");
          return;
        }

        const { platform, chatId } = subscription;
        widelog.set("platform", platform);
        widelog.set("chat_id", chatId);

        const result = await apiClient.notifySessionComplete({
          sessionId,
          platformOrigin: platform,
          platformChatId: chatId,
        });

        const adapter = getAdapter(platform);
        if (!adapter) {
          widelog.set("outcome", "error");
          widelog.set("skip_reason", "no_adapter");
          return;
        }

        const threadId = responseSubscriber.getThreadId(sessionId);
        const messagesToSend = [result.message];

        for (let i = 0; i < messagesToSend.length; i++) {
          const content = messagesToSend[i]!;
          const isLastMessage = i === messagesToSend.length - 1;

          await adapter.sendMessage({
            platform,
            chatId,
            content,
            threadId,
            attachments: isLastMessage ? result.attachments : undefined,
          });
        }

        widelog.set("messages_sent", messagesToSend.length);
        widelog.set("attachment_count", result.attachments?.length ?? 0);
        widelog.set("outcome", "success");
      } catch (error) {
        widelog.set("outcome", "error");
        widelog.errorFields(error);
      } finally {
        widelog.time.stop("duration_ms");
        widelog.flush();
        this.processingSet.delete(sessionId);
      }
    });
  }
}

export const completionListener = new CompletionListener();
