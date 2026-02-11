"use client";

import type { ReactNode } from "react";
import { NavTabs, type TabItem } from "@/components/nav-tabs";

const settingsTabs: TabItem[] = [
  { label: "GitHub", href: "/settings/github" },
  { label: "Providers", href: "/settings/providers" },
  {
    label: "Projects",
    href: "/settings/projects",
    match: "/settings/projects",
  },
  { label: "API Keys", href: "/settings/api-keys" },
];

interface SettingsShellProps {
  children: ReactNode;
}

export function SettingsShell({ children }: SettingsShellProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <NavTabs.FromItems items={settingsTabs} />
      {children}
    </div>
  );
}
