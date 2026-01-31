"use client";

import { useState } from "react";
import { Nav } from "@/components/nav";
import { Chat } from "@/components/chat";
import { MessagePart } from "@/components/message-part";
import { Orchestration, useOrchestration } from "@/components/orchestration";
import { ProjectNavigator } from "@/components/project-navigator-list";
import { Avatar } from "@/components/avatar";
import { StatusIcon } from "@/components/status-icon";
import { Hash } from "@/components/hash";
import { TextAreaGroup } from "@/components/textarea-group";
import { SplitPane, useSplitPane } from "@/components/split-pane";
import { navItems, mockProjects } from "@/placeholder/data";
import { mockPartsMessages } from "@/placeholder/parts";
import { modelGroups, defaultModel } from "@/placeholder/models";

function ProjectNavigatorView({ children }: { children?: React.ReactNode }) {
  const { selected, select } = useSplitPane();

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="flex flex-col gap-px bg-border py-pb">
        {mockProjects.map((project) => (
          <ProjectNavigator.List key={project.id}>
            <ProjectNavigator.Header onAdd={() => console.log("Add session to", project.name)}>
              <ProjectNavigator.HeaderName>{project.name}</ProjectNavigator.HeaderName>
              <ProjectNavigator.HeaderCount>{project.sessions.length}</ProjectNavigator.HeaderCount>
            </ProjectNavigator.Header>
            {project.sessions.map((session) => (
              <ProjectNavigator.Item
                key={session.id}
                selected={selected === session.id}
                onClick={() => select(session.id)}
              >
                <StatusIcon status={session.status} />
                <Hash>{session.id}</Hash>
                <ProjectNavigator.ItemTitle>{session.title}</ProjectNavigator.ItemTitle>
                <ProjectNavigator.ItemDescription>
                  {session.lastMessage}
                </ProjectNavigator.ItemDescription>
                <Avatar />
              </ProjectNavigator.Item>
            ))}
          </ProjectNavigator.List>
        ))}
      </div>
      {children}
    </div>
  );
}

function ConversationView({ sessionId }: { sessionId: string | null }) {
  const [model, setModel] = useState(defaultModel);

  if (!sessionId) {
    return (
      <div className="flex items-center justify-center h-full text-text-muted">
        Select a session to preview
      </div>
    );
  }

  const project = mockProjects.find((project) =>
    project.sessions.some((session) => session.id === sessionId),
  );

  if (!project) return null;

  const session = project.sessions.find((session) => session.id === sessionId);

  if (!session) return null;

  const partsMessages = mockPartsMessages[sessionId];

  return (
    <Chat.Provider key={sessionId}>
      <Chat.Frame>
        <Chat.Header>
          <StatusIcon status={session.status} />
          <Chat.HeaderBreadcrumb>
            <Chat.HeaderProject>{project.name}</Chat.HeaderProject>
            <Chat.HeaderDivider />
            <Chat.HeaderTitle>{session.title}</Chat.HeaderTitle>
          </Chat.HeaderBreadcrumb>
        </Chat.Header>
        <Chat.Tabs>
          <Chat.TabList>
            <Chat.Tab value="chat">Chat</Chat.Tab>
            <Chat.Tab value="review">Review</Chat.Tab>
            <Chat.Tab value="frame">Frame</Chat.Tab>
            <Chat.Tab value="stream">Stream</Chat.Tab>
          </Chat.TabList>
          <Chat.TabContent value="chat">
            <Chat.MessageList>
              <Chat.Messages>
                {partsMessages?.flatMap((message) =>
                  message.parts.map((part) => (
                    <Chat.Block key={part.id} role={message.role}>
                      <MessagePart.Root
                        part={part}
                        isStreaming={
                          message.role === "assistant" &&
                          message === partsMessages[partsMessages.length - 1]
                        }
                      />
                    </Chat.Block>
                  )),
                )}
              </Chat.Messages>
              <Chat.Input>
                <TextAreaGroup.ModelSelector
                  value={model}
                  groups={modelGroups}
                  onChange={setModel}
                />
              </Chat.Input>
            </Chat.MessageList>
          </Chat.TabContent>
          <Chat.TabContent value="review">
            <div className="flex-1 flex items-center justify-center text-text-muted">
              Review coming soon
            </div>
          </Chat.TabContent>
          <Chat.TabContent value="frame">
            <div className="flex-1 flex items-center justify-center text-text-muted">
              Frame coming soon
            </div>
          </Chat.TabContent>
          <Chat.TabContent value="stream">
            <div className="flex-1 flex items-center justify-center text-text-muted">
              Stream coming soon
            </div>
          </Chat.TabContent>
        </Chat.Tabs>
      </Chat.Frame>
    </Chat.Provider>
  );
}

function PromptArea() {
  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState(defaultModel);
  const orchestration = useOrchestration();

  const handleSubmit = async () => {
    if (!prompt.trim()) return;

    const id = orchestration.add({ status: "thinking" });
    setPrompt("");

    // Simulate orchestration flow
    await new Promise((resolve) => setTimeout(resolve, 1500));
    orchestration.update(id, { status: "delegating" });

    await new Promise((resolve) => setTimeout(resolve, 1000));
    orchestration.update(id, { status: "starting", projectName: "opencode-web" });

    await new Promise((resolve) => setTimeout(resolve, 1000));
    orchestration.remove(id);
  };

  return (
    <div className="sticky bottom-0 px-4 pb-4 pt-2 bg-linear-to-t from-bg to-transparent pointer-events-none">
      <Orchestration.List />
      <TextAreaGroup.Provider
        state={{ value: prompt }}
        actions={{
          onChange: setPrompt,
          onSubmit: handleSubmit,
        }}
      >
        <TextAreaGroup.Frame>
          <TextAreaGroup.Input />
          <TextAreaGroup.Toolbar>
            <TextAreaGroup.ModelSelector value={model} groups={modelGroups} onChange={setModel} />
            <TextAreaGroup.Submit />
          </TextAreaGroup.Toolbar>
        </TextAreaGroup.Frame>
      </TextAreaGroup.Provider>
    </div>
  );
}

export default function Page() {
  return (
    <Orchestration.Provider>
      <div className="flex flex-col h-screen">
        <Nav items={navItems} activeHref="/projects" />
        <SplitPane.Root>
          <SplitPane.Primary>
            <ProjectNavigatorView>
              <PromptArea />
            </ProjectNavigatorView>
          </SplitPane.Primary>
          <SplitPane.Secondary>
            {(selected) => <ConversationView sessionId={selected} />}
          </SplitPane.Secondary>
        </SplitPane.Root>
      </div>
    </Orchestration.Provider>
  );
}
