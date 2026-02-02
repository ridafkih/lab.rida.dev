"use client";

import { createContext, useContext, useEffect, useRef, useCallback, type ReactNode } from "react";
import { createOpencodeClient, type Event } from "@opencode-ai/sdk/client";

type EventListener = (event: Event) => void;

function getApiUrl(): string {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  if (!apiUrl) throw new Error("NEXT_PUBLIC_API_URL must be set");
  return apiUrl;
}

interface OpenCodeSessionContextValue {
  sessionId: string | null;
  subscribe: (listener: EventListener) => () => void;
}

const OpenCodeSessionContext = createContext<OpenCodeSessionContextValue | null>(null);

interface OpenCodeSessionProviderProps {
  sessionId: string | null;
  children: ReactNode;
}

export function OpenCodeSessionProvider({ sessionId, children }: OpenCodeSessionProviderProps) {
  const listenersRef = useRef<Set<EventListener>>(new Set());
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!sessionId) {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      return;
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    const signal = abortController.signal;

    const client = createOpencodeClient({
      baseUrl: `${getApiUrl()}/opencode`,
      headers: { "X-Lab-Session-Id": sessionId },
    });

    const connect = async (attempt = 0): Promise<void> => {
      if (signal.aborted) return;

      try {
        const { stream } = await client.event.subscribe({ query: {}, signal });

        for await (const event of stream) {
          if (signal.aborted) break;
          for (const listener of listenersRef.current) {
            listener(event);
          }
        }

        if (!signal.aborted) {
          return connect(0);
        }
      } catch {
        if (signal.aborted) return;

        const delay = Math.min(
          RECONNECT_BASE_DELAY_MS * Math.pow(2, attempt),
          RECONNECT_MAX_DELAY_MS,
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
        return connect(attempt + 1);
      }
    };

    connect();

    return () => {
      abortController.abort();
    };
  }, [sessionId]);

  const subscribe = useCallback((listener: EventListener) => {
    listenersRef.current.add(listener);
    return () => {
      listenersRef.current.delete(listener);
    };
  }, []);

  return (
    <OpenCodeSessionContext.Provider value={{ sessionId, subscribe }}>
      {children}
    </OpenCodeSessionContext.Provider>
  );
}

export function useOpenCodeSession() {
  const context = useContext(OpenCodeSessionContext);
  if (!context) {
    throw new Error("useOpenCodeSession must be used within OpenCodeSessionProvider");
  }
  return context;
}

export type { Event };

const RECONNECT_BASE_DELAY_MS = 1000;
const RECONNECT_MAX_DELAY_MS = 30000;
