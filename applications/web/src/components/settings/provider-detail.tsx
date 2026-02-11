"use client";

import { Check, ExternalLink } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import useSWR, { useSWRConfig } from "swr";
import { Button } from "@/components/button";
import { FormInput } from "@/components/form-input";

function getApiUrl(): string {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  if (!apiUrl) {
    throw new Error("NEXT_PUBLIC_API_URL must be set");
  }
  return apiUrl;
}

interface AuthMethod {
  type: "oauth" | "api";
  label: string;
}

interface ProviderData {
  id: string;
  name: string;
  env: string[];
  isConnected: boolean;
  authMethods: AuthMethod[];
}

async function fetchProviderData(providerId: string): Promise<ProviderData> {
  const apiUrl = getApiUrl();
  const [providersResponse, authMethodsResponse] = await Promise.all([
    fetch(`${apiUrl}/providers`),
    fetch(`${apiUrl}/providers/auth`),
  ]);

  if (!(providersResponse.ok && authMethodsResponse.ok)) {
    throw new Error("Failed to fetch provider data");
  }

  const providersData = await providersResponse.json();
  const authMethodsData = await authMethodsResponse.json();

  if (!(providersData && authMethodsData)) {
    throw new Error("Failed to fetch provider data");
  }

  const provider = providersData.all.find(
    (p: { id: string }) => p.id === providerId
  );
  if (!provider) {
    throw new Error("Provider not found");
  }

  return {
    id: provider.id,
    name: provider.name,
    env: provider.env,
    isConnected: providersData.connected.includes(provider.id),
    authMethods: authMethodsData[provider.id] ?? [],
  };
}

function hasApiKeyEnvVar(env: string[]): boolean {
  return env.some(
    (envVar) =>
      envVar.includes("API_KEY") ||
      envVar.includes("APIKEY") ||
      envVar.includes("TOKEN") ||
      envVar.includes("SECRET") ||
      envVar.includes("ACCESS_KEY") ||
      envVar.includes("CREDENTIALS") ||
      envVar.includes("SERVICE_KEY")
  );
}

function hasEndpointEnvVar(env: string[]): boolean {
  return env.some(
    (envVar) =>
      envVar.includes("ENDPOINT") ||
      envVar.includes("_URL") ||
      envVar.includes("BASE")
  );
}

function SettingsPanel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex-1 overflow-y-auto p-3">
      <div className="flex max-w-sm flex-col gap-2">{children}</div>
    </div>
  );
}

interface ApiKeyFormProps {
  providerId: string;
  refetch: () => void;
}

function ApiKeyForm({ providerId, refetch }: ApiKeyFormProps) {
  const { mutate } = useSWRConfig();
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!apiKey.trim()) {
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const apiUrl = getApiUrl();
      const response = await fetch(`${apiUrl}/providers/auth`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          providerID: providerId,
          auth: { type: "api", key: apiKey },
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to save API key");
      }

      setApiKey("");
      refetch();
      mutate("providers-list");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save API key");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-1">
      <FormInput.Label>API Key</FormInput.Label>
      <div className="flex gap-1">
        <div className="flex-1">
          <FormInput.Password
            onChange={(event) => setApiKey(event.target.value)}
            placeholder="Enter API key"
            value={apiKey}
          />
        </div>
        <FormInput.Submit
          disabled={!apiKey.trim()}
          loading={saving}
          loadingText="Saving..."
          onClick={handleSave}
        >
          Save
        </FormInput.Submit>
      </div>
      {error && <FormInput.Error>{error}</FormInput.Error>}
    </div>
  );
}

interface EndpointFormProps {
  providerId: string;
  refetch: () => void;
}

function EndpointForm({ providerId, refetch }: EndpointFormProps) {
  const [endpoint, setEndpoint] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!endpoint.trim()) {
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const apiUrl = getApiUrl();
      const response = await fetch(`${apiUrl}/providers/config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: {
            [providerId]: {
              options: { baseURL: endpoint },
            },
          },
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to save endpoint");
      }

      setEndpoint("");
      refetch();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save endpoint");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-1">
      <FormInput.Label>Endpoint URL</FormInput.Label>
      <div className="flex gap-1">
        <div className="flex-1">
          <FormInput.Text
            onChange={(event) => setEndpoint(event.target.value)}
            placeholder="https://api.example.com"
            value={endpoint}
          />
        </div>
        <FormInput.Submit
          disabled={!endpoint.trim()}
          loading={saving}
          loadingText="Saving..."
          onClick={handleSave}
        >
          Save
        </FormInput.Submit>
      </div>
      {error && <FormInput.Error>{error}</FormInput.Error>}
    </div>
  );
}

interface OAuthButtonProps {
  providerId: string;
  authMethods: AuthMethod[];
  refetch: () => void;
}

function OAuthButton({ providerId, authMethods, refetch }: OAuthButtonProps) {
  const { mutate } = useSWRConfig();
  const [polling, setPolling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
    };
  }, []);

  const oauthMethodIndex = authMethods.findIndex(
    (method) => method.type === "oauth"
  );
  const oauthMethod =
    oauthMethodIndex !== -1 ? authMethods[oauthMethodIndex] : null;

  if (!oauthMethod) {
    return null;
  }

  const stopPolling = () => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    setPolling(false);
  };

  const refreshAll = () => {
    refetch();
    mutate("providers-list");
  };

  const startPolling = () => {
    let attempts = 0;
    const maxAttempts = 60;

    setPolling(true);

    pollingRef.current = setInterval(async () => {
      attempts++;

      try {
        const apiUrl = getApiUrl();
        const response = await fetch(`${apiUrl}/providers`);
        if (response.ok) {
          const data = await response.json();
          const isConnected = data?.connected?.includes(providerId);

          if (isConnected) {
            stopPolling();
            refreshAll();
            return;
          }
        }
      } catch {
        // Continue polling on error
      }

      if (attempts >= maxAttempts) {
        stopPolling();
      }
    }, 2000);
  };

  const handleOAuthClick = async () => {
    setError(null);

    try {
      const apiUrl = getApiUrl();
      const response = await fetch(`${apiUrl}/providers/oauth/authorize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          providerID: providerId,
          method: oauthMethodIndex,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to start OAuth flow");
      }

      const oauthData = await response.json();
      if (!oauthData) {
        throw new Error("Failed to start OAuth flow");
      }

      window.open(oauthData.url, "_blank");

      if (oauthData.method === "auto") {
        startPolling();
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to start OAuth flow"
      );
    }
  };

  return (
    <div className="flex flex-col gap-1">
      {polling ? (
        <Button onClick={stopPolling} variant="ghost">
          Cancel
        </Button>
      ) : (
        <Button onClick={handleOAuthClick}>
          <ExternalLink size={12} />
          {oauthMethod.label}
        </Button>
      )}
      {error && <FormInput.Error>{error}</FormInput.Error>}
    </div>
  );
}

interface ProviderDetailProps {
  providerId: string;
}

export function ProviderDetail({ providerId }: ProviderDetailProps) {
  const { data, error, isLoading, mutate } = useSWR(
    `provider-${providerId}`,
    () => fetchProviderData(providerId)
  );

  if (isLoading) {
    return (
      <SettingsPanel>
        <span className="text-text-muted text-xs">Loading...</span>
      </SettingsPanel>
    );
  }

  if (error || !data) {
    return (
      <SettingsPanel>
        <FormInput.Error>Failed to load provider</FormInput.Error>
      </SettingsPanel>
    );
  }

  const hasOAuth = data.authMethods.some((method) => method.type === "oauth");
  const hasApiKey =
    data.authMethods.some((method) => method.type === "api") ||
    (data.authMethods.length === 0 && hasApiKeyEnvVar(data.env));
  const hasEndpoint = hasEndpointEnvVar(data.env);
  const hasMultipleMethods = hasOAuth && hasApiKey;

  return (
    <SettingsPanel>
      <div className="flex items-center justify-between">
        <span className="font-medium text-text text-xs">{data.name}</span>
        {data.isConnected && (
          <span className="flex items-center gap-1 text-green-500 text-xs">
            <Check size={12} />
            Connected
          </span>
        )}
      </div>

      <div className="flex flex-col gap-2">
        {hasOAuth && (
          <OAuthButton
            authMethods={data.authMethods}
            providerId={data.id}
            refetch={mutate}
          />
        )}
        {hasMultipleMethods && (
          <div className="flex items-center gap-2">
            <div className="h-px flex-1 bg-border" />
            <span className="text-text-muted text-xs">or</span>
            <div className="h-px flex-1 bg-border" />
          </div>
        )}
        {hasApiKey && <ApiKeyForm providerId={data.id} refetch={mutate} />}
        {hasEndpoint && <EndpointForm providerId={data.id} refetch={mutate} />}
      </div>
    </SettingsPanel>
  );
}
