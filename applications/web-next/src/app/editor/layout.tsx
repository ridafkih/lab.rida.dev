"use client";

import type { ReactNode } from "react";
import { useParams } from "next/navigation";
import { Nav } from "@/components/nav";
import { ProjectNavigatorView } from "@/components/project-navigator-view";
import { OpenCodeSessionProvider } from "@/lib/opencode-session";
import { defaultSettingsTab } from "@/config/settings";

const navItems = [
  { label: "Home", href: "/" },
  { label: "Editor", href: "/editor" },
  { label: "Settings", href: defaultSettingsTab.href, match: "/settings" },
];

function Sidebar({ selectedSessionId }: { selectedSessionId: string | null }) {
  return (
    <aside className="relative flex grow flex-col max-w-lg border-r border-border bg-bg">
      <ProjectNavigatorView selectedSessionId={selectedSessionId} />
    </aside>
  );
}

export default function EditorLayout({ children }: { children: ReactNode }) {
  const params = useParams();
  const sessionId = typeof params.sessionId === "string" ? params.sessionId : null;

  return (
    <OpenCodeSessionProvider sessionId={sessionId}>
      <div className="flex flex-col h-screen">
        <Nav items={navItems} />
        <div className="flex flex-1 min-h-0">
          <Sidebar selectedSessionId={sessionId} />
          <main className="flex-1 bg-bg overflow-x-hidden">{children}</main>
        </div>
      </div>
    </OpenCodeSessionProvider>
  );
}
