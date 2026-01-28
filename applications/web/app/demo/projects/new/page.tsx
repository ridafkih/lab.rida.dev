"use client";

import { useState } from "react";
import { Copy } from "@lab/ui/components/copy";
import { Heading } from "@lab/ui/components/heading";
import { Button } from "@lab/ui/components/button";
import { Plus, X, Container, Eye, EyeOff, Check } from "lucide-react";

type EnvVar = { key: string; value: string; revealed: boolean };

export default function NewProjectPage() {
  const [image, setImage] = useState("");
  const [ports, setPorts] = useState<string[]>([""]);
  const [systemPrompt, setSystemPrompt] = useState("");
  const [permissions, setPermissions] = useState({ accessFiles: true, runCommands: true });
  const [envVars, setEnvVars] = useState<EnvVar[]>([]);
  const [newEnvKey, setNewEnvKey] = useState("");
  const [newEnvValue, setNewEnvValue] = useState("");

  const addPort = () => setPorts([...ports, ""]);
  const removePort = (index: number) => setPorts(ports.filter((_, i) => i !== index));
  const updatePort = (index: number, value: string) => {
    const newPorts = [...ports];
    newPorts[index] = value;
    setPorts(newPorts);
  };

  const addEnvVar = () => {
    if (newEnvKey.trim()) {
      setEnvVars([...envVars, { key: newEnvKey, value: newEnvValue, revealed: false }]);
      setNewEnvKey("");
      setNewEnvValue("");
    }
  };

  const removeEnvVar = (index: number) => setEnvVars(envVars.filter((_, i) => i !== index));

  const toggleEnvVarReveal = (index: number) => {
    setEnvVars(envVars.map((v, i) => (i === index ? { ...v, revealed: !v.revealed } : v)));
  };

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-2xl mx-auto py-8 px-4">
        <div className="mb-6">
          <Heading as="h2" size="xl">
            New Project
          </Heading>
          <Copy muted>Configure a new project with container settings.</Copy>
        </div>

        <div className="flex flex-col gap-6">
          <FormField label="Container Image" hint="e.g., ghcr.io/ridafkih/agent-playground:main">
            <div className="flex items-center gap-2 bg-muted border border-border px-2 py-1.5">
              <Container className="size-3 text-muted-foreground" />
              <input
                type="text"
                value={image}
                onChange={(e) => setImage(e.currentTarget.value)}
                placeholder="ghcr.io/org/image:tag"
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
            </div>
          </FormField>

          <FormField label="Exposed Ports" hint="Ports to expose from the container">
            <div className="flex flex-col gap-1">
              {ports.map((port, index) => (
                <div key={index} className="flex items-center gap-1">
                  <input
                    type="text"
                    value={port}
                    onChange={(e) => updatePort(index, e.currentTarget.value)}
                    placeholder="8080"
                    className="flex-1 bg-muted border border-border px-2 py-1.5 text-sm outline-none placeholder:text-muted-foreground"
                  />
                  {ports.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removePort(index)}
                      className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted"
                    >
                      <X className="size-3" />
                    </button>
                  )}
                </div>
              ))}
              <Button variant="outline" icon={<Plus className="size-3" />} onClick={addPort}>
                Add Port
              </Button>
            </div>
          </FormField>

          <FormField label="Agent Permissions">
            <div className="flex flex-col gap-1">
              <Checkbox
                checked={permissions.accessFiles}
                onChange={(checked) => setPermissions({ ...permissions, accessFiles: checked })}
              >
                Access files
              </Checkbox>
              <Checkbox
                checked={permissions.runCommands}
                onChange={(checked) => setPermissions({ ...permissions, runCommands: checked })}
              >
                Run commands
              </Checkbox>
            </div>
          </FormField>

          <FormField label="Environment Variables">
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-1">
                <input
                  type="text"
                  value={newEnvKey}
                  onChange={(e) => setNewEnvKey(e.currentTarget.value)}
                  placeholder="KEY"
                  className="flex-1 bg-muted border border-border px-2 py-1.5 text-sm outline-none placeholder:text-muted-foreground font-mono"
                />
                <input
                  type="text"
                  value={newEnvValue}
                  onChange={(e) => setNewEnvValue(e.currentTarget.value)}
                  placeholder="value"
                  className="flex-1 bg-muted border border-border px-2 py-1.5 text-sm outline-none placeholder:text-muted-foreground"
                />
                <Button variant="outline" icon={<Plus className="size-3" />} onClick={addEnvVar}>
                  Add
                </Button>
              </div>
              {envVars.length > 0 && (
                <div className="flex flex-col border border-border">
                  {envVars.map((envVar, index) => (
                    <div
                      key={index}
                      className="flex items-center gap-2 px-2 py-1.5 border-b border-border last:border-b-0"
                    >
                      <Copy size="xs" className="font-mono font-medium">
                        {envVar.key}
                      </Copy>
                      <Copy size="xs" muted className="flex-1 truncate font-mono">
                        {envVar.revealed ? envVar.value : "••••••••"}
                      </Copy>
                      <button
                        type="button"
                        onClick={() => toggleEnvVarReveal(index)}
                        className="p-1 text-muted-foreground hover:text-foreground"
                      >
                        {envVar.revealed ? (
                          <EyeOff className="size-3" />
                        ) : (
                          <Eye className="size-3" />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => removeEnvVar(index)}
                        className="p-1 text-muted-foreground hover:text-foreground"
                      >
                        <X className="size-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </FormField>

          <FormField label="System Prompt" hint="Instructions for the agent">
            <textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.currentTarget.value)}
              placeholder="You are a helpful coding assistant..."
              rows={12}
              className="w-full bg-muted border border-border px-2 py-1.5 text-sm outline-none resize-none placeholder:text-muted-foreground"
            />
          </FormField>

          <div className="flex items-center justify-end gap-2 pt-4 border-t border-border">
            <Button variant="outline">Cancel</Button>
            <Button variant="primary">Create Project</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function FormField({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div>
        <Copy size="sm" className="font-medium">
          {label}
        </Copy>
        {hint && (
          <Copy size="xs" muted>
            {hint}
          </Copy>
        )}
      </div>
      {children}
    </div>
  );
}

function Checkbox({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="flex items-center gap-1.5 cursor-pointer">
      <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`size-3 border flex items-center justify-center ${
          checked ? "border-foreground bg-foreground text-background" : "border-muted-foreground"
        }`}
      >
        {checked && <Check className="size-2" />}
      </button>
      <Copy size="xs">{children}</Copy>
    </label>
  );
}
