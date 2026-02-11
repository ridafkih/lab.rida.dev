"use client";

import { Circle } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, type ReactNode, use } from "react";
import useSWR from "swr";
import { tv } from "tailwind-variants";
import { cn } from "@/lib/cn";

function getApiUrl(): string {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  if (!apiUrl) {
    throw new Error("NEXT_PUBLIC_API_URL must be set");
  }
  return apiUrl;
}

interface Provider {
  id: string;
  name: string;
}

interface ProvidersListData {
  providers: Provider[];
  connected: string[];
}

interface ProvidersListContextValue {
  state: {
    providers: Provider[];
    connected: string[];
    isLoading: boolean;
    error: Error | null;
  };
  actions: {
    refetch: () => void;
  };
}

const ProvidersListContext = createContext<ProvidersListContextValue | null>(
  null
);

function useProvidersList() {
  const context = use(ProvidersListContext);
  if (!context) {
    throw new Error(
      "ProvidersList components must be used within ProvidersList.Provider"
    );
  }
  return context;
}

async function fetchProvidersList(): Promise<ProvidersListData> {
  const apiUrl = getApiUrl();
  const response = await fetch(`${apiUrl}/providers`);

  if (!response.ok) {
    throw new Error("Failed to fetch providers");
  }

  const providersData = await response.json();
  if (!providersData) {
    throw new Error("Failed to fetch providers");
  }

  const providers = providersData.all
    .map((provider: { id: string; name: string }) => ({
      id: provider.id,
      name: provider.name,
    }))
    .sort((a: Provider, b: Provider) => a.name.localeCompare(b.name));

  return {
    providers,
    connected: providersData.connected,
  };
}

function ProvidersListProvider({ children }: { children: ReactNode }) {
  const { data, error, isLoading, mutate } = useSWR(
    "providers-list",
    fetchProvidersList
  );

  const contextValue: ProvidersListContextValue = {
    state: {
      providers: data?.providers ?? [],
      connected: data?.connected ?? [],
      isLoading,
      error: error ?? null,
    },
    actions: {
      refetch: mutate,
    },
  };

  return (
    <ProvidersListContext value={contextValue}>{children}</ProvidersListContext>
  );
}

function ProvidersListRoot({ children }: { children: ReactNode }) {
  return <div className="flex flex-col">{children}</div>;
}

function ProvidersListHeader({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center justify-between px-2 py-1.5">
      <span className="text-text-secondary text-xs">{children}</span>
    </div>
  );
}

function ProvidersListLoading() {
  const { state } = useProvidersList();
  if (!state.isLoading) {
    return null;
  }
  return (
    <span className="px-2 py-1.5 text-text-muted text-xs">Loading...</span>
  );
}

function ProvidersListError() {
  const { state } = useProvidersList();
  if (!state.error) {
    return null;
  }
  return (
    <span className="px-2 py-1.5 text-red-500 text-xs">Failed to load</span>
  );
}

function ProvidersListEmpty() {
  const { state } = useProvidersList();
  if (state.isLoading || state.error || state.providers.length > 0) {
    return null;
  }
  return (
    <span className="px-2 py-1.5 text-text-muted text-xs">
      No providers available
    </span>
  );
}

const itemStyles = tv({
  base: "flex items-center gap-1.5 px-2 py-1.5 text-xs hover:bg-bg-hover",
  variants: {
    active: {
      true: "bg-bg-muted",
      false: "",
    },
  },
});

function ProvidersListItem({ provider }: { provider: Provider }) {
  const pathname = usePathname();
  const { state } = useProvidersList();

  const isConnected = state.connected.includes(provider.id);
  const href = `/settings/providers/${provider.id}`;
  const isActive = pathname === href;

  return (
    <Link className={itemStyles({ active: isActive })} href={href}>
      <Circle
        className={cn(
          "shrink-0",
          isConnected ? "fill-green-500 text-green-500" : "text-text-muted"
        )}
        size={6}
      />
      <span className="truncate text-text">{provider.name}</span>
    </Link>
  );
}

function ProvidersListItems() {
  const { state } = useProvidersList();
  if (state.isLoading || state.error || state.providers.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col">
      {state.providers.map((provider) => (
        <ProvidersListItem key={provider.id} provider={provider} />
      ))}
    </div>
  );
}

function ProvidersListView() {
  return (
    <ProvidersListProvider>
      <ProvidersListRoot>
        <ProvidersListHeader>Providers</ProvidersListHeader>
        <ProvidersListLoading />
        <ProvidersListError />
        <ProvidersListEmpty />
        <ProvidersListItems />
      </ProvidersListRoot>
    </ProvidersListProvider>
  );
}

const ProvidersList = {
  Provider: ProvidersListProvider,
  Root: ProvidersListRoot,
  Header: ProvidersListHeader,
  Loading: ProvidersListLoading,
  Error: ProvidersListError,
  Empty: ProvidersListEmpty,
  Item: ProvidersListItem,
  Items: ProvidersListItems,
  View: ProvidersListView,
};

export { ProvidersList };
