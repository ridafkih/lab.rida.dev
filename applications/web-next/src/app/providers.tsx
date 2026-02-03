"use client";

import { createContext, use, type ReactNode } from "react";
import { SWRConfig } from "swr";
import { MultiplayerProvider } from "@/lib/multiplayer";

interface ProvidersProps {
  children: ReactNode;
  fallback?: Record<string, unknown>;
}

export const MultiplayerEnabledContext = createContext(false);

export function useMultiplayerEnabled() {
  return use(MultiplayerEnabledContext);
}

export function Providers({ children, fallback = {} }: ProvidersProps) {
  const wsUrl = process.env.NEXT_PUBLIC_WS_URL;

  const swrContent = (
    <SWRConfig
      value={{
        fallback,
        dedupingInterval: 2000,
        revalidateOnFocus: false,
        shouldRetryOnError: true,
        errorRetryCount: 3,
      }}
    >
      {children}
    </SWRConfig>
  );

  if (!wsUrl) {
    return <MultiplayerEnabledContext value={false}>{swrContent}</MultiplayerEnabledContext>;
  }

  return (
    <MultiplayerEnabledContext value={true}>
      <MultiplayerProvider config={{ url: wsUrl }}>{swrContent}</MultiplayerProvider>
    </MultiplayerEnabledContext>
  );
}
