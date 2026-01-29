"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Sidebar,
  SidebarPanel,
  SidebarPanelGroup,
  SidebarHeader,
  SidebarBody,
  SidebarFooter,
  SidebarProject,
  SidebarSession,
  SidebarNewSession,
  SidebarAction,
} from "@/components/sidebar";
import { Avatar } from "@lab/ui/components/avatar";
import { Copy } from "@lab/ui/components/copy";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogActions,
  AlertDialogCancel,
  AlertDialogAction,
} from "@lab/ui/components/alert-dialog";
import { X, Settings, ChevronDown, FolderKanban, Cpu, GitBranch } from "lucide-react";
import {
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem,
  DropdownSeparator,
} from "@lab/ui/components/dropdown";
import { Box } from "lucide-react";
import type { ReactNode } from "react";
import { useMultiplayer } from "@/lib/multiplayer/client";
import { useCreateSession, useDeleteSession, OpenCodeEventsProvider } from "@/lib/api";

interface ProjectSessionsPanelProps {
  project: { id: string; name: string };
  sessions: { id: string; title: string; hasUnread?: boolean; isWorking?: boolean }[];
  activeSessionId: string | null;
}

function ProjectSessionsPanel({ project, sessions, activeSessionId }: ProjectSessionsPanelProps) {
  const router = useRouter();
  const { createSession } = useCreateSession(project.id);
  const { deleteSession, isDeleting } = useDeleteSession();
  const [sessionToDelete, setSessionToDelete] = useState<string | null>(null);

  const handleNewSession = async () => {
    const session = await createSession();
    router.push(`/${project.id}/${session.id}`);
  };

  const handleDelete = async () => {
    if (!sessionToDelete) return;
    await deleteSession(sessionToDelete);
    if (activeSessionId === sessionToDelete) {
      router.push(`/${project.id}`);
    }
    setSessionToDelete(null);
  };

  return (
    <SidebarPanel>
      <SidebarHeader
        action={<SidebarAction icon={<X />} label="Close" onClick={() => router.push("/")} />}
      >
        {project.name}
      </SidebarHeader>
      <SidebarBody>
        <SidebarNewSession onClick={handleNewSession} />
        {sessions.map((session) => (
          <SidebarSession
            key={session.id}
            title={session.title}
            hasUnread={session.hasUnread}
            isWorking={session.isWorking}
            active={activeSessionId === session.id}
            onClick={() => router.push(`/${project.id}/${session.id}`)}
            onDelete={() => setSessionToDelete(session.id)}
          />
        ))}
      </SidebarBody>
      <AlertDialog open={Boolean(sessionToDelete)} onOpenChange={() => setSessionToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogTitle>Delete session?</AlertDialogTitle>
          <AlertDialogDescription>
            This will stop all containers and permanently delete this session.
          </AlertDialogDescription>
          <AlertDialogActions>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={handleDelete} loading={isDeleting}>
              Delete
            </AlertDialogAction>
          </AlertDialogActions>
        </AlertDialogContent>
      </AlertDialog>
    </SidebarPanel>
  );
}

export default function MainLayout({ children }: { children: ReactNode }) {
  const params = useParams();
  const router = useRouter();

  const { useChannel } = useMultiplayer();

  const projects = useChannel("projects");
  const sessions = useChannel("sessions");

  const projectId = params.projectId
    ? typeof params.projectId === "string"
      ? params.projectId
      : params.projectId[0]
    : null;

  const sessionId = params.sessionId
    ? typeof params.sessionId === "string"
      ? params.sessionId
      : params.sessionId[0]
    : null;

  return (
    <OpenCodeEventsProvider sessionId={sessionId}>
      <div className="flex flex-col h-screen bg-background text-foreground">
        <div className="flex flex-1 min-h-0 min-w-0">
          <Sidebar>
            <SidebarPanel>
              <div className="h-8 border-b border-border">
                <Dropdown className="w-full h-full">
                  <DropdownTrigger className="flex items-center gap-1 w-full h-full px-2 text-xs text-muted-foreground hover:bg-muted/50">
                    <span className="flex-1 text-left truncate">Acme Inc</span>
                    <ChevronDown className="size-3" />
                  </DropdownTrigger>
                  <DropdownMenu>
                    {projects.map((project) => (
                      <DropdownItem
                        key={project.id}
                        icon={<Box className="size-3" />}
                        onClick={() => router.push(`/projects/${project.id}/settings`)}
                      >
                        {project.name}
                      </DropdownItem>
                    ))}
                    <DropdownSeparator />
                    <DropdownItem
                      icon={<FolderKanban className="size-3" />}
                      onClick={() => router.push("/projects/new")}
                    >
                      New Project
                    </DropdownItem>
                    <DropdownItem
                      icon={<Cpu className="size-3" />}
                      onClick={() => router.push("/settings/providers")}
                    >
                      Providers
                    </DropdownItem>
                    <DropdownItem
                      icon={<GitBranch className="size-3" />}
                      onClick={() => router.push("/settings/git")}
                    >
                      Git Settings
                    </DropdownItem>
                  </DropdownMenu>
                </Dropdown>
              </div>
              <SidebarBody>
                {projects.map((project) => (
                  <SidebarProject
                    key={project.id}
                    name={project.name}
                    active={projectId === project.id}
                    onClick={() => router.push(projectId === project.id ? "/" : `/${project.id}`)}
                  />
                ))}
              </SidebarBody>
              <SidebarFooter>
                <div className="flex items-center gap-1.5">
                  <Avatar size="xs" fallback="JD" presence="online" />
                  <Copy as="span" size="xs" className="flex-1 truncate">
                    john@acme.com
                  </Copy>
                  <SidebarAction icon={<Settings />} label="Settings" />
                </div>
              </SidebarFooter>
            </SidebarPanel>

            {projectId && (
              <SidebarPanelGroup>
                {projects
                  .filter((project) => project.id === projectId)
                  .map((project) => (
                    <ProjectSessionsPanel
                      key={project.id}
                      project={project}
                      sessions={sessions.filter((session) => session.projectId === project.id)}
                      activeSessionId={sessionId}
                    />
                  ))}
              </SidebarPanelGroup>
            )}
          </Sidebar>

          <main className="flex-1 flex flex-col min-w-0">{children}</main>
        </div>
        <footer className="h-8 border-t border-border" />
      </div>
    </OpenCodeEventsProvider>
  );
}
