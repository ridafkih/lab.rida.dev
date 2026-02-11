"use client";

import { Copy, Trash2 } from "lucide-react";
import { useState } from "react";
import useSWR from "swr";
import { FormInput } from "@/components/form-input";
import { api } from "@/lib/api";

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function ApiKeysTab() {
  const {
    data: keys,
    error,
    isLoading,
    mutate,
  } = useSWR("api-keys", () => api.apiKeys.list());

  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleCreate = async () => {
    if (!name.trim()) {
      return;
    }

    setCreating(true);
    setCreateError(null);
    setNewKey(null);

    try {
      const result = await api.apiKeys.create({ name: name.trim() });
      setNewKey(result.key);
      setName("");
      mutate();
    } catch (err) {
      setCreateError(
        err instanceof Error ? err.message : "Failed to create API key"
      );
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (keyId: string) => {
    setDeletingId(keyId);
    try {
      await api.apiKeys.delete(keyId);
      mutate();
    } catch {
      // silently fail
    } finally {
      setDeletingId(null);
    }
  };

  const handleCopy = async () => {
    if (!newKey) {
      return;
    }
    await navigator.clipboard.writeText(newKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (isLoading) {
    return (
      <div className="flex-1 overflow-y-auto p-3">
        <span className="text-text-muted text-xs">Loading...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 overflow-y-auto p-3">
        <FormInput.Error>Failed to load API keys</FormInput.Error>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-3">
      <div className="flex max-w-lg flex-col gap-3">
        <div className="flex flex-col gap-1">
          <FormInput.Label>Create API Key</FormInput.Label>
          <div className="flex gap-1">
            <FormInput.Text
              onChange={(event) => setName(event.target.value)}
              placeholder="Key name (e.g. platform-bridge)"
              value={name}
            />
            <FormInput.Submit
              disabled={!name.trim()}
              loading={creating}
              loadingText="Creating..."
              onClick={handleCreate}
            >
              Create
            </FormInput.Submit>
          </div>
          {createError && <FormInput.Error>{createError}</FormInput.Error>}
        </div>

        {newKey && (
          <div className="flex flex-col gap-1 border border-border p-2">
            <span className="font-medium text-text-secondary text-xs">
              API key created — copy it now, it won't be shown again
            </span>
            <div className="flex items-center gap-1">
              <code className="flex-1 break-all bg-bg-muted px-1.5 py-0.5 text-text text-xs">
                {newKey}
              </code>
              <button
                className="shrink-0 p-1 text-text-muted hover:text-text"
                onClick={handleCopy}
                type="button"
              >
                <Copy size={12} />
              </button>
            </div>
            {copied && (
              <span className="text-green-500 text-xs">
                Copied to clipboard
              </span>
            )}
          </div>
        )}

        {keys && keys.length > 0 && (
          <div className="flex flex-col gap-1">
            <FormInput.Label>Existing Keys</FormInput.Label>
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-text-muted">
                  <th className="py-1 pr-3 font-normal">Name</th>
                  <th className="py-1 pr-3 font-normal">Prefix</th>
                  <th className="py-1 pr-3 font-normal">Last Used</th>
                  <th className="py-1 pr-3 font-normal">Created</th>
                  <th className="py-1 font-normal" />
                </tr>
              </thead>
              <tbody>
                {keys.map((key) => (
                  <tr
                    className="border-border-subtle border-t text-text"
                    key={key.id}
                  >
                    <td className="py-1 pr-3">{key.name}</td>
                    <td className="py-1 pr-3">
                      <code>{key.keyPrefix}...</code>
                    </td>
                    <td className="py-1 pr-3 text-text-muted">
                      {key.lastUsedAt ? formatDate(key.lastUsedAt) : "Never"}
                    </td>
                    <td className="py-1 pr-3 text-text-muted">
                      {formatDate(key.createdAt)}
                    </td>
                    <td className="py-1">
                      <button
                        className="p-0.5 text-text-muted hover:text-red-500 disabled:opacity-50"
                        disabled={deletingId === key.id}
                        onClick={() => handleDelete(key.id)}
                        type="button"
                      >
                        <Trash2 size={12} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {keys && keys.length === 0 && !newKey && (
          <span className="text-text-muted text-xs">
            No API keys yet. Create one to authenticate service-to-service
            requests.
          </span>
        )}
      </div>
    </div>
  );
}
