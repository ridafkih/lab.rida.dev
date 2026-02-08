import { logger } from "../../logging";
import { IMessageSDK, type Message } from "@photon-ai/imessage-kit";
import { writeFile, unlink, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import type { PlatformAdapter, MessageHandler } from "../types";
import type { OutgoingPlatformMessage, MessageAttachment } from "../../types/messages";
import { config } from "../../config/environment";

export class IMessageAdapter implements PlatformAdapter {
  readonly platform = "imessage" as const;
  readonly messagingMode = "passive" as const;
  private sdk: IMessageSDK | null = null;
  private handler: MessageHandler | null = null;
  private watchedContacts: Set<string>;

  constructor() {
    this.watchedContacts = new Set(config.imessageWatchedContacts);
  }

  async initialize(): Promise<void> {
    if (!config.imessageEnabled) {
      logger.info({ event_name: "imessage.adapter_disabled" });
      return;
    }

    this.sdk = new IMessageSDK();
    logger.info({ event_name: "imessage.adapter_initialized" });
  }

  async startListening(handler: MessageHandler): Promise<void> {
    if (!this.sdk) {
      logger.error({ event_name: "imessage.start_listening_failed_not_initialized" });
      return;
    }

    this.handler = handler;

    await this.sdk.startWatching({
      onNewMessage: async (message: Message) => {
        logger.info({
          event_name: "imessage.message_received",
          guid: message.guid,
          text_preview: message.text?.slice(0, 50),
        });

        if (message.isFromMe) return;
        if (!this.shouldMonitor(message.chatId)) return;
        if (!this.handler) return;
        if (!message.text) return;

        const history = await this.getConversationHistory(message.chatId);

        await this.handler({
          platform: "imessage",
          chatId: message.chatId,
          userId: message.sender,
          messageId: message.guid,
          content: message.text,
          timestamp: new Date(message.date),
          metadata: {
            isGroupChat: message.isGroupChat,
            senderName: message.sender,
            conversationHistory: history,
          },
        });
      },
      onGroupMessage: async (message: Message) => {
        logger.info({
          event_name: "imessage.group_message_received",
          guid: message.guid,
          text_preview: message.text?.slice(0, 50),
        });

        if (message.isFromMe) return;
        if (!this.shouldMonitor(message.chatId)) return;
        if (!this.handler) return;
        if (!message.text) return;

        const history = await this.getConversationHistory(message.chatId);

        await this.handler({
          platform: "imessage",
          chatId: message.chatId,
          userId: message.sender,
          messageId: message.guid,
          content: message.text,
          timestamp: new Date(message.date),
          metadata: {
            isGroupChat: message.isGroupChat,
            senderName: message.sender,
            conversationHistory: history,
          },
        });
      },
      onError: (error: Error) => {
        logger.error({
          event_name: "imessage.sdk_error",
          error: error.message,
        });
      },
    });

    logger.info({ event_name: "imessage.started_listening" });
    if (this.watchedContacts.size > 0) {
      logger.info({
        event_name: "imessage.filtering_contacts",
        contacts: Array.from(this.watchedContacts),
      });
    }
  }

  async stopListening(): Promise<void> {
    if (this.sdk) {
      this.sdk.stopWatching();
      await this.sdk.close();
      logger.info({ event_name: "imessage.stopped_listening" });
    }
    this.handler = null;
  }

  async sendMessage(message: OutgoingPlatformMessage): Promise<void> {
    if (!this.sdk) {
      throw new Error("iMessage adapter not initialized");
    }

    const attachmentPaths: string[] = [];

    try {
      if (message.attachments && message.attachments.length > 0) {
        for (const attachment of message.attachments) {
          const filePath = await this.writeAttachmentToTempFile(attachment);
          attachmentPaths.push(filePath);
        }
      }

      if (attachmentPaths.length > 0) {
        await this.sdk.send(message.chatId, {
          text: message.content || undefined,
          images: attachmentPaths,
        });
      } else {
        await this.sdk.send(message.chatId, message.content);
      }

      logger.info({
        event_name: "imessage.message_sent",
        chat_id: message.chatId,
      });
    } finally {
      for (const filePath of attachmentPaths) {
        try {
          await unlink(filePath);
        } catch {
          logger.error({
            event_name: "imessage.temp_file_cleanup_failed",
            file_path: filePath,
          });
        }
      }
    }
  }

  private async writeAttachmentToTempFile(attachment: MessageAttachment): Promise<string> {
    const tempDir = join(tmpdir(), "lab-imessage-attachments");
    await mkdir(tempDir, { recursive: true });

    let buffer: Buffer;
    let extension: string;

    if (attachment.type === "image_url") {
      // Fetch image from URL
      const response = await fetch(attachment.url);
      if (!response.ok) {
        throw new Error(`Failed to fetch image: ${response.statusText}`);
      }
      const arrayBuffer = await response.arrayBuffer();
      buffer = Buffer.from(arrayBuffer);

      // Determine extension from content-type or URL
      const contentType = response.headers.get("content-type");
      if (contentType?.includes("png")) {
        extension = "png";
      } else if (contentType?.includes("jpeg") || contentType?.includes("jpg")) {
        extension = "jpg";
      } else if (contentType?.includes("webp")) {
        extension = "webp";
      } else {
        // Fallback: try to get from URL
        const urlPath = new URL(attachment.url).pathname;
        extension = urlPath.split(".").pop() || "png";
      }
    } else {
      // Base64 encoded image
      extension = attachment.format === "png" ? "png" : attachment.format;
      buffer = Buffer.from(attachment.data, attachment.encoding);
    }

    const fileName = `${randomUUID()}.${extension}`;
    const filePath = join(tempDir, fileName);
    await writeFile(filePath, buffer);

    return filePath;
  }

  shouldMonitor(chatId: string): boolean {
    if (this.watchedContacts.size === 0) return true;
    return this.watchedContacts.has(chatId);
  }

  private async getConversationHistory(chatId: string): Promise<string[]> {
    if (!this.sdk) return [];

    const result = await this.sdk.getMessages({
      chatId,
      limit: config.imessageContextMessages,
    });

    return result.messages.map((msg) => `${msg.isFromMe ? "Me" : msg.sender}: ${msg.text}`);
  }
}

export const imessageAdapter = new IMessageAdapter();
