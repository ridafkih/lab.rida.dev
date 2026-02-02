"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ProjectNavigator } from "@/components/project-navigator-list";
import { Avatar } from "@/components/avatar";
import { StatusIcon } from "@/components/status-icon";
import { Hash } from "@/components/hash";
import { useProjects, useSessions, useCreateSession, useSessionCreation } from "@/lib/hooks";
import { prefetchSessionMessages } from "@/lib/use-agent";
import { prefetchSessionContainers } from "@/lib/api";
import { useSessionStatus } from "@/lib/use-session-status";
import { useMultiplayer } from "@/lib/multiplayer";
import { useSessionsSync } from "@/lib/use-sessions-sync";
import type { Project, Session } from "@lab/client";

type SessionItemProps = {
  session: Session;
  isSelected: boolean;
};

function SessionItem({ session, isSelected }: SessionItemProps) {
  const { useChannel } = useMultiplayer();
  const metadata = useChannel("sessionMetadata", { uuid: session.id });
  const status = useSessionStatus(session, { subscribeToEvents: isSelected });

  const handleMouseDown = () => {
    prefetchSessionMessages(session.id);
    prefetchSessionContainers(session.id);
  };

  return (
    <Link href={`/editor/${session.id}/chat`} className="contents">
      <ProjectNavigator.Item selected={isSelected} onMouseDown={handleMouseDown}>
        <StatusIcon status={status} />
        <Hash>{session.id.slice(0, 6)}</Hash>
        <div className="shrink-0">
          <ProjectNavigator.ItemTitle empty={!session.title}>
            {session.title}
          </ProjectNavigator.ItemTitle>
        </div>
        <div className="flex gap-2 justify-end grow min-w-0">
          <ProjectNavigator.ItemDescription>
            {metadata.lastMessage}
          </ProjectNavigator.ItemDescription>
        </div>
      </ProjectNavigator.Item>
    </Link>
  );
}

type ProjectSessionsListProps = {
  project: Project;
  selectedSessionId: string | null;
};

function ProjectSessionsList({ project, selectedSessionId }: ProjectSessionsListProps) {
  const router = useRouter();
  const { data: sessions } = useSessions(project.id);
  const createSession = useCreateSession();
  const [creationState, setCreationState] = useSessionCreation();

  const sessionCount = sessions?.length ?? 0;
  const isCreatingHere = creationState.isCreating && creationState.projectId === project.id;
  const showSkeleton = isCreatingHere && sessionCount === creationState.sessionCountAtCreation;

  useEffect(() => {
    if (!isCreatingHere || !sessions) return;
    if (sessionCount > creationState.sessionCountAtCreation) {
      const newSession = sessions[sessions.length - 1];
      if (newSession) {
        router.push(`/editor/${newSession.id}/chat`);
        setCreationState({ isCreating: false, projectId: null, sessionCountAtCreation: 0 });
      }
    }
  }, [
    isCreatingHere,
    sessions,
    sessionCount,
    creationState.sessionCountAtCreation,
    router,
    setCreationState,
  ]);

  const handleAddSession = () => {
    createSession(project.id, { currentSessionCount: sessionCount });
  };

  return (
    <ProjectNavigator.List>
      <ProjectNavigator.Header onAdd={handleAddSession}>
        <ProjectNavigator.HeaderName>{project.name}</ProjectNavigator.HeaderName>
        <ProjectNavigator.HeaderCount>{sessionCount}</ProjectNavigator.HeaderCount>
      </ProjectNavigator.Header>
      {sessions?.map((session) => (
        <SessionItem
          key={session.id}
          session={session}
          isSelected={selectedSessionId === session.id}
        />
      ))}
      {showSkeleton && (
        <ProjectNavigator.ItemSkeleton>
          <ProjectNavigator.ItemSkeletonBlock />
          <ProjectNavigator.ItemTitle empty>Unnamed Session</ProjectNavigator.ItemTitle>
        </ProjectNavigator.ItemSkeleton>
      )}
    </ProjectNavigator.List>
  );
}

type ProjectNavigatorViewProps = {
  selectedSessionId?: string | null;
};

export function ProjectNavigatorView({ selectedSessionId = null }: ProjectNavigatorViewProps) {
  const { data: projects, isLoading, error } = useProjects();

  useSessionsSync();

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="flex flex-col gap-px bg-border pb-px">
        {isLoading && (
          <div className="px-3 py-2 bg-bg text-xs text-text-muted">Loading projects...</div>
        )}
        {error && (
          <div className="px-3 py-2 bg-bg text-xs text-red-500">Failed to load projects</div>
        )}
        {projects && projects.length === 0 && (
          <div className="px-3 py-2 bg-bg text-xs text-text-muted">No projects yet</div>
        )}
        {projects?.map((project) => (
          <ProjectSessionsList
            key={project.id}
            project={project}
            selectedSessionId={selectedSessionId}
          />
        ))}
      </div>
    </div>
  );
}
