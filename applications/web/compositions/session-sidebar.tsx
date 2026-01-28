"use client";

import { cn } from "@lab/ui/utils/cn";
import { Copy } from "@lab/ui/components/copy";
import { Avatar } from "@lab/ui/components/avatar";
import { useState } from "react";
import { GitBranch, CheckCircle, Circle, ExternalLink, Container, ChevronDown } from "lucide-react";

type PromptEngineer = {
  id: string;
  name: string;
  avatar?: string;
};

type Branch = {
  id: string;
  name: string;
  prNumber?: number;
  prUrl?: string;
};

type Task = {
  id: string;
  title: string;
  completed: boolean;
};

type Link = {
  id: string;
  title: string;
  url: string;
};

type ContainerStatus = "running" | "stopped" | "starting" | "error";

type ContainerInfo = {
  id: string;
  name: string;
  status: ContainerStatus;
};

type SessionSidebarProps = {
  promptEngineers: PromptEngineer[];
  createdAt: string;
  branches: Branch[];
  tasks: Task[];
  links: Link[];
  containers: ContainerInfo[];
};

const containerStatusStyles: Record<ContainerStatus, string> = {
  running: "bg-success",
  stopped: "bg-muted-foreground",
  starting: "bg-warning animate-pulse",
  error: "bg-destructive",
};

export function SessionSidebar({
  promptEngineers,
  createdAt,
  branches,
  tasks,
  links,
  containers,
}: SessionSidebarProps) {
  return (
    <aside className="w-64 border-l border-border h-full flex flex-col">
      <div className="h-8 border-b border-border" />
      <div className="flex-1 overflow-y-auto">
        <Section title="Prompt Engineers">
          <div className="flex items-center gap-2">
            <div className="flex -space-x-1">
              {promptEngineers.slice(0, 3).map((engineer) => (
                <Avatar
                  key={engineer.id}
                  size="xs"
                  fallback={engineer.name.slice(0, 2).toUpperCase()}
                />
              ))}
            </div>
            <Copy size="xs" muted>
              {promptEngineers.length} {promptEngineers.length === 1 ? "engineer" : "engineers"}
            </Copy>
          </div>
        </Section>

        <Section title="Created">
          <Copy size="xs" muted>
            {createdAt}
          </Copy>
        </Section>

        <Section title="Branches">
          {branches.length === 0 ? (
            <Copy size="xs" muted>
              No branches yet
            </Copy>
          ) : (
            <div className="flex flex-col gap-1">
              {branches.map((branch) => (
                <div key={branch.id} className="flex items-center gap-1.5">
                  <GitBranch className="w-3 h-3 text-muted-foreground" />
                  <Copy size="xs" className="truncate">
                    {branch.name}
                  </Copy>
                  {branch.prNumber && (
                    <a
                      href={branch.prUrl}
                      className="text-xs text-accent hover:underline"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      #{branch.prNumber}
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </Section>

        <Section title="Containers">
          <div className="flex flex-col gap-1">
            {containers.map((container) => (
              <div key={container.id} className="flex items-center gap-1.5">
                <Container className="w-3 h-3 text-muted-foreground" />
                <Copy size="xs" className="flex-1 truncate">
                  {container.name}
                </Copy>
                <span className={cn("w-1.5 h-1.5", containerStatusStyles[container.status])} />
              </div>
            ))}
          </div>
        </Section>

        <Section title="Tasks">
          {tasks.length === 0 ? (
            <Copy size="xs" muted>
              No tasks yet
            </Copy>
          ) : (
            <div className="flex flex-col gap-1">
              {tasks.map((task) => (
                <div key={task.id} className="flex items-center gap-1.5">
                  {task.completed ? (
                    <CheckCircle className="w-3 h-3 text-success" />
                  ) : (
                    <Circle className="w-3 h-3 text-muted-foreground" />
                  )}
                  <Copy
                    size="xs"
                    className={cn(task.completed && "line-through text-muted-foreground")}
                  >
                    {task.title}
                  </Copy>
                </div>
              ))}
            </div>
          )}
        </Section>

        <Section title="Links">
          {links.length === 0 ? (
            <Copy size="xs" muted>
              No links yet
            </Copy>
          ) : (
            <div className="flex flex-col gap-1">
              {links.map((link) => (
                <a
                  key={link.id}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-xs text-accent hover:underline"
                >
                  <ExternalLink className="w-3 h-3" />
                  {link.title}
                </a>
              ))}
            </div>
          )}
        </Section>

        <Section title="Stream">
          <div className="aspect-video bg-muted flex items-center justify-center">
            <Copy size="xs" muted>
              No stream
            </Copy>
          </div>
        </Section>
      </div>
    </aside>
  );
}

type SectionProps = {
  title: string;
  children: React.ReactNode;
};

function Section({ title, children }: SectionProps) {
  return (
    <div className="px-3 py-2 border-b border-border">
      <Copy size="xs" muted className="mb-1.5 block">
        {title}
      </Copy>
      {children}
    </div>
  );
}
