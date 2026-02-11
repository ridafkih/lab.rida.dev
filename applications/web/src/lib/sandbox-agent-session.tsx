"use client";

import { createContext, type ReactNode, useContext, useRef } from "react";
import type { SandboxAgentEvent } from "./sandbox-agent-types";

export type EventListener = (event: SandboxAgentEvent) => void;

export function getAgentApiUrl(): string {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  if (!apiUrl) {
    throw new Error("NEXT_PUBLIC_API_URL must be set");
  }
  return apiUrl;
}

interface SandboxAgentSessionContextValue {
  sessionId: string | null;
  subscribe: (listener: EventListener) => () => void;
  publish: (event: SandboxAgentEvent) => void;
}

const SandboxAgentSessionContext =
  createContext<SandboxAgentSessionContextValue | null>(null);

interface SandboxAgentSessionProviderProps {
  sessionId: string | null;
  children: ReactNode;
}

export function parseSSEChunk(chunk: string): SandboxAgentEvent | null {
  const lines = chunk.split("\n");
  let eventType = "";
  let dataStr = "";

  for (const line of lines) {
    if (line.startsWith("event: ")) {
      eventType = line.slice(7).trim();
    } else if (line.startsWith("data: ")) {
      dataStr += line.slice(6);
    }
  }

  if (!dataStr) {
    return null;
  }

  try {
    const parsed = JSON.parse(dataStr);
    const type =
      eventType || (typeof parsed.type === "string" ? parsed.type : "");
    if (!type) {
      return null;
    }
    const sequence = typeof parsed.sequence === "number" ? parsed.sequence : 0;
    const data =
      typeof parsed.data === "object" && parsed.data !== null
        ? parsed.data
        : parsed;
    return { type, sequence, data };
  } catch {
    return null;
  }
}

export function SandboxAgentSessionProvider({
  sessionId,
  children,
}: SandboxAgentSessionProviderProps) {
  const listenersRef = useRef<Set<EventListener>>(new Set());

  const subscribeRef = useRef((listener: EventListener) => {
    listenersRef.current.add(listener);
    return () => {
      listenersRef.current.delete(listener);
    };
  });

  const publishRef = useRef((event: SandboxAgentEvent) => {
    for (const listener of listenersRef.current) {
      listener(event);
    }
  });

  return (
    <SandboxAgentSessionContext
      value={{
        sessionId,
        subscribe: subscribeRef.current,
        publish: publishRef.current,
      }}
    >
      {children}
    </SandboxAgentSessionContext>
  );
}

export function useSandboxAgentSession() {
  const context = useContext(SandboxAgentSessionContext);
  if (!context) {
    throw new Error(
      "useSandboxAgentSession must be used within SandboxAgentSessionProvider"
    );
  }
  return context;
}
