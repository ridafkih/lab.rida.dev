"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AppView } from "@/components/app-view";
import { CenteredLayout } from "@/components/centered-layout";
import { Nav } from "@/components/nav";
import { TextAreaGroup } from "@/components/textarea-group";
import { Orchestration, useOrchestration } from "@/components/orchestration";
import { SessionList } from "@/components/session-list";
import { navItems } from "@/placeholder/data";
import { useModels } from "@/lib/hooks";
import { defaultModel } from "@/placeholder/models";

function OrchestratorPrompt() {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState(defaultModel);
  const { data: modelGroups } = useModels();
  const orchestration = useOrchestration();

  const handleSubmit = async () => {
    if (!prompt.trim()) return;

    const id = orchestration.add({ status: "thinking" });
    setPrompt("");

    await new Promise((resolve) => setTimeout(resolve, 1500));
    orchestration.update(id, { status: "delegating" });

    await new Promise((resolve) => setTimeout(resolve, 1000));
    orchestration.update(id, { status: "starting", projectName: "opencode-web" });

    await new Promise((resolve) => setTimeout(resolve, 1000));
    orchestration.remove(id);

    router.push("/editor");
  };

  return (
    <div className="w-full">
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
            {modelGroups && (
              <TextAreaGroup.ModelSelector value={model} groups={modelGroups} onChange={setModel} />
            )}
            <TextAreaGroup.Submit />
          </TextAreaGroup.Toolbar>
        </TextAreaGroup.Frame>
      </TextAreaGroup.Provider>
    </div>
  );
}

export default function Page() {
  return (
    <AppView.Provider>
      <Orchestration.Provider>
        <div className="flex flex-col h-screen">
          <Nav items={navItems} />
          <CenteredLayout.Root>
            <CenteredLayout.Hero>
              <OrchestratorPrompt />
            </CenteredLayout.Hero>
            <CenteredLayout.Content>
              <SessionList.View />
            </CenteredLayout.Content>
          </CenteredLayout.Root>
        </div>
      </Orchestration.Provider>
    </AppView.Provider>
  );
}
