"use client";

import type { ReactNode } from "react";
import { ExternalLink, Box, GitBranch, FileText, CheckSquare } from "lucide-react";
import { tv } from "tailwind-variants";
import { cn } from "@/lib/cn";

const text = tv({
  base: "text-xs",
  variants: {
    color: {
      default: "text-text",
      secondary: "text-text-secondary",
      muted: "text-text-muted",
      accent: "text-accent",
      success: "text-green-500",
      warning: "text-yellow-500",
      error: "text-red-500",
    },
    font: {
      sans: "",
      mono: "font-mono",
    },
  },
  defaultVariants: {
    color: "default",
    font: "sans",
  },
});

const row = tv({
  base: "flex items-center gap-1.5 text-xs",
  variants: {
    interactive: {
      true: "cursor-pointer",
    },
  },
});

const statusDot = tv({
  base: "w-1.5 h-1.5 rounded-full",
  variants: {
    status: {
      running: "bg-green-500",
      stopped: "bg-red-500",
      starting: "bg-yellow-500",
    },
  },
});

function SessionInfoPaneRoot({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col gap-px bg-border h-full overflow-y-auto">
      {children}
      <div className="bg-bg grow" />
    </div>
  );
}

function SessionInfoPaneSection({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-1 bg-bg px-3 py-2">{children}</div>;
}

function SessionInfoPaneSectionHeader({ children }: { children: ReactNode }) {
  return <div className={text({ color: "secondary" })}>{children}</div>;
}

function SessionInfoPaneEmpty({ children }: { children: ReactNode }) {
  return <div className={text({ color: "muted" })}>{children}</div>;
}

function SessionInfoPaneFileItem({
  path,
  status,
}: {
  path: string;
  status?: "added" | "modified" | "deleted";
}) {
  const statusColor = {
    added: "success",
    modified: "warning",
    deleted: "error",
  } as const;

  return (
    <div className={row({ interactive: true })}>
      <FileText size={12} className={text({ color: "muted" })} />
      <span className="flex-1 truncate">{path}</span>
      {status && (
        <span className={text({ color: statusColor[status] })}>{status[0].toUpperCase()}</span>
      )}
    </div>
  );
}

function SessionInfoPaneBranchItem({ name, current }: { name: string; current?: boolean }) {
  return (
    <div className={row({ interactive: true })}>
      <GitBranch size={12} className={text({ color: "muted" })} />
      <span className={cn("flex-1 truncate", current && "font-medium")}>{name}</span>
      {current && <span className={text({ color: "muted" })}>current</span>}
    </div>
  );
}

function SessionInfoPaneContainerItem({
  name,
  status,
}: {
  name: string;
  status: "running" | "stopped" | "starting";
}) {
  return (
    <div className={row({ interactive: true })}>
      <Box size={12} className={text({ color: "muted" })} />
      <span className="flex-1 truncate">{name}</span>
      <span className={statusDot({ status })} />
    </div>
  );
}

function SessionInfoPaneTaskItem({
  title,
  status,
}: {
  title: string;
  status: "pending" | "in_progress" | "completed";
}) {
  const statusIcon = {
    pending: "○",
    in_progress: "◐",
    completed: "●",
  };

  return (
    <div className={row({ interactive: true })}>
      <CheckSquare size={12} className={text({ color: "muted" })} />
      <span className="flex-1 truncate">{title}</span>
      <span className={text({ color: "muted" })}>{statusIcon[status]}</span>
    </div>
  );
}

function SessionInfoPaneLinkItem({ href, label }: { href: string; label?: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={row({ interactive: true, className: text({ color: "accent" }) })}
    >
      <ExternalLink size={12} />
      <span className="flex-1 truncate">{label ?? href}</span>
    </a>
  );
}

function SessionInfoPaneStream({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 bg-bg pt-2">
      <div className={cn("px-3", text({ color: "secondary" }))}>Live Browser</div>
      {children}
    </div>
  );
}

function SessionInfoPaneStreamPlaceholder() {
  return <div className="aspect-video bg-bg-muted" />;
}

function SessionInfoPaneLogItem({
  message,
  level = "info",
}: {
  message: string;
  level?: "info" | "warn" | "error";
}) {
  const levelColor = {
    info: "muted",
    warn: "warning",
    error: "error",
  } as const;

  return <div className={text({ color: levelColor[level], font: "mono" })}>{message}</div>;
}

const SessionInfoPane = {
  Root: SessionInfoPaneRoot,
  Section: SessionInfoPaneSection,
  SectionHeader: SessionInfoPaneSectionHeader,
  Empty: SessionInfoPaneEmpty,
  FileItem: SessionInfoPaneFileItem,
  BranchItem: SessionInfoPaneBranchItem,
  ContainerItem: SessionInfoPaneContainerItem,
  TaskItem: SessionInfoPaneTaskItem,
  LinkItem: SessionInfoPaneLinkItem,
  Stream: SessionInfoPaneStream,
  StreamPlaceholder: SessionInfoPaneStreamPlaceholder,
  LogItem: SessionInfoPaneLogItem,
};

export { SessionInfoPane };
