"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useCallback,
  useState,
  type ReactNode,
} from "react";
import { createOpencodeClient, type Event } from "@opencode-ai/sdk/client";
import type { ConnectionStatus } from "../types";

type EventHandler = (event: Event) => void;

interface OpenCodeEventsContextValue {
  subscribe: (handler: EventHandler) => () => void;
  connectionStatus: ConnectionStatus;
}

const OpenCodeEventsContext = createContext<OpenCodeEventsContextValue | null>(null);

interface OpenCodeEventsProviderProps {
  children: ReactNode;
}

const INITIAL_RECONNECT_DELAY = 1000;
const MAX_RECONNECT_DELAY = 30000;
const RECONNECT_MULTIPLIER = 2;

export function OpenCodeEventsProvider({ children }: OpenCodeEventsProviderProps) {
  const handlersRef = useRef<Set<EventHandler>>(new Set());
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("connecting");
  const reconnectDelayRef = useRef(INITIAL_RECONNECT_DELAY);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const abortController = new AbortController();

    const connect = async () => {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL;

      if (!apiUrl) {
        console.error("NEXT_PUBLIC_API_URL not set");
        setConnectionStatus("disconnected");
        return;
      }

      const client = createOpencodeClient({ baseUrl: `${apiUrl}/opencode` });

      try {
        setConnectionStatus((prev) =>
          prev === "disconnected" || prev === "reconnecting" ? "reconnecting" : "connecting",
        );

        const { stream } = await client.event.subscribe();

        setConnectionStatus("connected");
        reconnectDelayRef.current = INITIAL_RECONNECT_DELAY;

        for await (const event of stream) {
          if (abortController.signal.aborted) {
            break;
          }

          for (const handler of handlersRef.current) {
            handler(event);
          }
        }

        if (!abortController.signal.aborted) {
          setConnectionStatus("disconnected");
          scheduleReconnect();
        }
      } catch (error) {
        if (abortController.signal.aborted) {
          return;
        }

        console.error("OpenCode event stream error:", error);
        setConnectionStatus("disconnected");
        scheduleReconnect();
      }
    };

    const scheduleReconnect = () => {
      if (abortController.signal.aborted) {
        return;
      }

      const delay = reconnectDelayRef.current;
      reconnectDelayRef.current = Math.min(delay * RECONNECT_MULTIPLIER, MAX_RECONNECT_DELAY);

      setConnectionStatus("reconnecting");

      reconnectTimeoutRef.current = setTimeout(() => {
        if (!abortController.signal.aborted) {
          connect();
        }
      }, delay);
    };

    connect();

    return () => {
      abortController.abort();
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, []);

  const subscribe = useCallback((handler: EventHandler) => {
    handlersRef.current.add(handler);

    return () => {
      handlersRef.current.delete(handler);
    };
  }, []);

  return (
    <OpenCodeEventsContext.Provider value={{ subscribe, connectionStatus }}>
      {children}
    </OpenCodeEventsContext.Provider>
  );
}

export function useOpenCodeEvents(): OpenCodeEventsContextValue {
  const context = useContext(OpenCodeEventsContext);

  if (!context) {
    throw new Error("useOpenCodeEvents must be used within OpenCodeEventsProvider");
  }

  return context;
}
