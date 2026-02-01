"use client";

import { useRouter } from "next/navigation";
import { Box, Plus } from "lucide-react";
import type { ReactNode } from "react";
import type { Project, Session } from "@lab/client";
import { tv } from "tailwind-variants";
import { useProjects, useSessions, useCreateSession, useSessionCreation } from "@/lib/hooks";
import { StatusIcon } from "./status-icon";
import { Hash } from "./hash";
import { IconButton } from "./icon-button";

const row = tv({
  base: "flex items-center gap-3 py-2 cursor-pointer transition-colors",
  variants: {
    type: {
      project: "text-text-secondary",
      session: "hover:text-text",
    },
  },
});

function SessionListRoot({ children }: { children: ReactNode }) {
  return <div className="flex flex-col">{children}</div>;
}

function SessionListProject({ project, children }: { project: Project; children?: ReactNode }) {
  const { data: sessions } = useSessions(project.id);
  const createSession = useCreateSession();
  const [creationState] = useSessionCreation();

  const sessionCount = sessions?.length ?? 0;
  const isCreatingHere = creationState.isCreating && creationState.projectId === project.id;
  const showSkeleton = isCreatingHere && sessionCount === creationState.sessionCountAtCreation;

  const handleAddSession = (event: React.MouseEvent) => {
    event.stopPropagation();
    createSession(project.id, { currentSessionCount: sessionCount });
  };

  return (
    <div>
      <div className={row({ type: "project" })}>
        <Box size={14} className="shrink-0" />
        <span className="font-medium">{project.name}</span>
        <span className="text-text-muted text-sm">{sessionCount}</span>
        <IconButton
          onClick={handleAddSession}
          className="ml-auto opacity-0 group-hover:opacity-100"
        >
          <Plus size={14} />
        </IconButton>
      </div>
      {children}
      {showSkeleton && (
        <div className={row({ type: "session" })}>
          <StatusIcon status="starting" />
          <span className="text-text-muted italic">Spawning Session...</span>
        </div>
      )}
    </div>
  );
}

function SessionListItem({ session }: { session: Session }) {
  const router = useRouter();

  const handleClick = () => {
    router.push(`/editor?session=${session.id}`);
  };

  return (
    <div onClick={handleClick} className={row({ type: "session" })}>
      <StatusIcon status={session.status} />
      <Hash>{session.id.slice(0, 6)}</Hash>
      {session.title ? (
        <span className="text-text truncate">{session.title}</span>
      ) : (
        <span className="text-text-muted italic truncate">Unnamed Session</span>
      )}
    </div>
  );
}

function SessionListEmpty() {
  return <div className="text-text-muted text-sm py-4 text-center">No projects yet</div>;
}

function SessionListLoading() {
  return <div className="text-text-muted text-sm py-4 text-center">Loading projects...</div>;
}

function SessionListView() {
  const { data: projects, isLoading } = useProjects();

  if (isLoading) {
    return <SessionListLoading />;
  }

  if (!projects || projects.length === 0) {
    return <SessionListEmpty />;
  }

  return (
    <SessionListRoot>
      {projects.map((project) => (
        <SessionListProject key={project.id} project={project}>
          <SessionListSessions projectId={project.id} />
        </SessionListProject>
      ))}
    </SessionListRoot>
  );
}

function SessionListSessions({ projectId }: { projectId: string }) {
  const { data: sessions } = useSessions(projectId);

  if (!sessions || sessions.length === 0) {
    return null;
  }

  return (
    <>
      {sessions.map((session) => (
        <SessionListItem key={session.id} session={session} />
      ))}
    </>
  );
}

export const SessionList = {
  Root: SessionListRoot,
  Project: SessionListProject,
  Item: SessionListItem,
  Sessions: SessionListSessions,
  Empty: SessionListEmpty,
  Loading: SessionListLoading,
  View: SessionListView,
};
