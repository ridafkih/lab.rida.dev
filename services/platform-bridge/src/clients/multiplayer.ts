import { logger } from "../logging";
import type { WireClientMessage, WireServerMessage } from "@lab/multiplayer-sdk";
import { config } from "../config/environment";
import type { SessionMessage } from "../types/messages";

type MessageListener = (message: SessionMessage) => void;

interface SessionCompleteEvent {
  sessionId: string;
  completedAt: number;
}

type SessionCompleteListener = (event: SessionCompleteEvent) => void;

function isSessionCompleteEvent(value: unknown): value is SessionCompleteEvent {
  if (typeof value !== "object" || value === null) return false;
  if (!("sessionId" in value) || typeof value.sessionId !== "string") return false;
  if (!("completedAt" in value) || typeof value.completedAt !== "number") return false;
  return true;
}

function isSessionMessage(value: unknown): value is SessionMessage {
  if (typeof value !== "object" || value === null) return false;
  if (!("id" in value) || typeof value.id !== "string") return false;
  if (!("role" in value) || (value.role !== "user" && value.role !== "assistant")) return false;
  if (!("content" in value) || typeof value.content !== "string") return false;
  if (!("timestamp" in value) || typeof value.timestamp !== "number") return false;
  if (!("senderId" in value) || typeof value.senderId !== "string") return false;
  return true;
}

function isSessionCompleteChannel(channel: string): boolean {
  return channel.startsWith("session/") && channel.endsWith("/complete");
}

function isServerMessage(value: unknown): value is WireServerMessage {
  if (typeof value !== "object" || value === null) return false;
  if (!("type" in value)) return false;

  const { type } = value as { type: unknown };

  if (type === "pong") return true;
  if (!("channel" in value)) return false;
  if (typeof (value as { channel: unknown }).channel !== "string") return false;

  switch (type) {
    case "snapshot":
    case "delta":
    case "event":
      return true;
    case "error":
      return "error" in value && typeof (value as { error: unknown }).error === "string";
    default:
      return false;
  }
}

export class MultiplayerClient {
  private ws: WebSocket | null = null;
  private url: string;
  private subscriptions = new Map<string, Set<MessageListener>>();
  private sessionCompleteSubscriptions = new Map<string, Set<SessionCompleteListener>>();
  private messageQueue: WireClientMessage[] = [];
  private reconnectAttempt = 0;
  private maxReconnectAttempts = 10;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private isConnecting = false;

  constructor(url: string = config.apiWsUrl) {
    this.url = url;
  }

  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN || this.isConnecting) return;

    this.isConnecting = true;
    logger.info({
      event_name: "multiplayer.connecting",
      url: this.url,
    });

    try {
      this.ws = new WebSocket(this.url);
      this.ws.addEventListener("open", this.handleOpen.bind(this));
      this.ws.addEventListener("close", this.handleClose.bind(this));
      this.ws.addEventListener("error", this.handleError.bind(this));
      this.ws.addEventListener("message", this.handleMessage.bind(this));
    } catch (error) {
      logger.error({
        event_name: "multiplayer.connection_error",
        error: error instanceof Error ? error.message : String(error),
      });
      this.isConnecting = false;
      this.scheduleReconnect();
    }
  }

  disconnect(): void {
    this.clearReconnectTimeout();
    this.clearHeartbeat();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  subscribeToSession(sessionId: string, listener: MessageListener): () => void {
    const channel = `session/${sessionId}/messages`;

    if (!this.subscriptions.has(channel)) {
      this.subscriptions.set(channel, new Set());
      this.send({ type: "subscribe", channel });
    }

    this.subscriptions.get(channel)!.add(listener);

    return () => {
      const listeners = this.subscriptions.get(channel);
      if (listeners) {
        listeners.delete(listener);
        if (listeners.size === 0) {
          this.subscriptions.delete(channel);
          this.send({ type: "unsubscribe", channel });
        }
      }
    };
  }

  subscribeToSessionComplete(sessionId: string, listener: SessionCompleteListener): () => void {
    const channel = `session/${sessionId}/complete`;

    if (!this.sessionCompleteSubscriptions.has(channel)) {
      this.sessionCompleteSubscriptions.set(channel, new Set());
      this.send({ type: "subscribe", channel });
    }

    this.sessionCompleteSubscriptions.get(channel)!.add(listener);

    return () => {
      const listeners = this.sessionCompleteSubscriptions.get(channel);
      if (listeners) {
        listeners.delete(listener);
        if (listeners.size === 0) {
          this.sessionCompleteSubscriptions.delete(channel);
          this.send({ type: "unsubscribe", channel });
        }
      }
    };
  }

  private send(message: WireClientMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      this.messageQueue.push(message);
    }
  }

  private handleOpen(): void {
    logger.info({ event_name: "multiplayer.connected" });
    this.isConnecting = false;
    this.reconnectAttempt = 0;
    this.flushQueue();
    this.resubscribeAll();
    this.startHeartbeat();
  }

  private handleClose(): void {
    logger.info({ event_name: "multiplayer.disconnected" });
    this.isConnecting = false;
    this.clearHeartbeat();
    this.ws = null;
    this.scheduleReconnect();
  }

  private handleError(event: Event): void {
    logger.error({
      event_name: "multiplayer.websocket_error",
    });
  }

  private handleMessage(event: MessageEvent): void {
    try {
      const parsed: unknown = JSON.parse(event.data);

      if (!isServerMessage(parsed)) return;
      if (parsed.type === "pong") return;

      if (parsed.type !== "event") return;
      if (!("channel" in parsed) || typeof parsed.channel !== "string") return;
      if (!("data" in parsed)) return;

      const { channel, data } = parsed;

      if (isSessionCompleteChannel(channel) && isSessionCompleteEvent(data)) {
        const listeners = this.sessionCompleteSubscriptions.get(channel);
        if (listeners) {
          for (const listener of listeners) {
            listener(data);
          }
        }
        return;
      }

      const listeners = this.subscriptions.get(channel);
      if (listeners && isSessionMessage(data)) {
        for (const listener of listeners) {
          listener(data);
        }
      }
    } catch (error) {
      logger.error({
        event_name: "multiplayer.malformed_message",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private flushQueue(): void {
    const queue = this.messageQueue;
    this.messageQueue = [];
    for (const message of queue) {
      this.send(message);
    }
  }

  private resubscribeAll(): void {
    for (const channel of this.subscriptions.keys()) {
      this.send({ type: "subscribe", channel });
    }

    for (const channel of this.sessionCompleteSubscriptions.keys()) {
      this.send({ type: "subscribe", channel });
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempt >= this.maxReconnectAttempts) {
      logger.error({ event_name: "multiplayer.max_reconnect_attempts" });
      return;
    }

    this.reconnectAttempt++;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempt - 1), 30000);
    logger.info({
      event_name: "multiplayer.reconnecting",
      delay_ms: delay,
      attempt: this.reconnectAttempt,
    });
    this.reconnectTimeout = setTimeout(() => this.connect(), delay);
  }

  private startHeartbeat(): void {
    this.clearHeartbeat();
    this.heartbeatInterval = setInterval(() => {
      this.send({ type: "ping" });
    }, 30000);
  }

  private clearHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  private clearReconnectTimeout(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
  }
}

export const multiplayerClient = new MultiplayerClient();
