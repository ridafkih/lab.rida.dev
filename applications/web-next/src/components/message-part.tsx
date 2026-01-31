"use client";

import { createContext, use, useState, type ReactNode } from "react";
import type {
  Part,
  TextPart,
  ReasoningPart,
  ToolPart,
  FilePart,
  StepStartPart,
  StepFinishPart,
  SnapshotPart,
  PatchPart,
  AgentPart,
  RetryPart,
  CompactionPart,
} from "@opencode-ai/sdk/client";
import { Check, ChevronRight, Loader2 } from "lucide-react";
import { tv } from "tailwind-variants";
import { Markdown } from "./markdown";
import { cn } from "@/lib/cn";
import {
  isTextPart,
  isReasoningPart,
  isToolPart,
  isFilePart,
  isStepStartPart,
  isStepFinishPart,
  isSnapshotPart,
  isPatchPart,
  isAgentPart,
  isSubtaskPart,
  isRetryPart,
  isCompactionPart,
  type SubtaskPart,
} from "@/lib/opencode";

const contentBlock = tv({
  base: "px-4 py-3 text-sm",
});

function MessagePartText({ part, isStreaming }: { part: TextPart; isStreaming?: boolean }) {
  return (
    <div className={contentBlock()}>
      <Markdown isStreaming={isStreaming}>{part.text}</Markdown>
    </div>
  );
}

type ReasoningContextValue = {
  state: { expanded: boolean };
  actions: { toggle: () => void };
  meta: { part: ReasoningPart };
};

const ReasoningContext = createContext<ReasoningContextValue | null>(null);

function useReasoning() {
  const context = use(ReasoningContext);
  if (!context) {
    throw new Error("Reasoning components must be used within MessagePart.Reasoning");
  }
  return context;
}

function MessagePartReasoning({ part, children }: { part: ReasoningPart; children: ReactNode }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <ReasoningContext
      value={{
        state: { expanded },
        actions: { toggle: () => setExpanded(!expanded) },
        meta: { part },
      }}
    >
      <div>{children}</div>
    </ReasoningContext>
  );
}

function MessagePartReasoningHeader({ children }: { children: ReactNode }) {
  const { actions } = useReasoning();

  return (
    <button
      type="button"
      onClick={actions.toggle}
      className="flex items-center gap-1.5 w-full px-4 py-1 text-xs cursor-pointer hover:bg-bg-hover"
    >
      {children}
    </button>
  );
}

function MessagePartReasoningChevron() {
  const { state } = useReasoning();
  return (
    <ChevronRight size={12} className={cn("text-text-muted", state.expanded && "rotate-90")} />
  );
}

function MessagePartReasoningContent() {
  const { state, meta } = useReasoning();
  if (!state.expanded) return null;
  return (
    <div className={cn(contentBlock(), "text-text-muted")}>
      <Markdown>{meta.part.text}</Markdown>
    </div>
  );
}

const actionRow = tv({
  base: "flex items-center gap-2 px-4 py-2 text-sm",
});

const stripedBackground = {
  background: `repeating-linear-gradient(
    -45deg,
    transparent,
    transparent 4px,
    var(--color-border) 4px,
    var(--color-border) 5px
  )`,
};

const toolStatus = tv({
  base: "",
  variants: {
    status: {
      pending: "text-text-muted",
      running: "text-text-muted animate-spin",
      completed: "text-green-500",
      error: "text-red-500",
    },
  },
});

type ToolContextValue = {
  state: { expanded: boolean };
  actions: { toggle: () => void };
  meta: { part: ToolPart };
};

const ToolContext = createContext<ToolContextValue | null>(null);

function useTool() {
  const context = use(ToolContext);
  if (!context) {
    throw new Error("Tool components must be used within MessagePart.Tool");
  }
  return context;
}

function MessagePartTool({ part, children }: { part: ToolPart; children: ReactNode }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <ToolContext
      value={{
        state: { expanded },
        actions: { toggle: () => setExpanded(!expanded) },
        meta: { part },
      }}
    >
      <div>{children}</div>
    </ToolContext>
  );
}

function MessagePartToolStatus() {
  const { meta } = useTool();
  const status = meta.part.state.status;

  if (status === "running" || status === "pending") {
    return <Loader2 size={12} className={toolStatus({ status: "running" })} />;
  }
  if (status === "completed") {
    return <Check size={12} className={toolStatus({ status })} />;
  }
  if (status === "error") {
    return <span className={toolStatus({ status })}>✕</span>;
  }
  return null;
}

function MessagePartToolName() {
  const { meta } = useTool();
  return <span className="text-text-secondary">{meta.part.tool}</span>;
}

function MessagePartToolPath() {
  const { meta } = useTool();
  const input = meta.part.state.input as Record<string, unknown>;
  const path = (input?.file_path as string) ?? (input?.path as string) ?? null;
  if (!path) return <span className="flex-1" />;
  return <span className="flex-1 text-left">{path}</span>;
}

function MessagePartToolDuration() {
  const { meta } = useTool();
  const status = meta.part.state.status;
  if (status !== "completed" && status !== "error") return null;
  const duration = meta.part.state.time.end - meta.part.state.time.start;
  return <span className="text-text-muted">{duration}ms</span>;
}

function MessagePartToolChevron() {
  const { state } = useTool();
  return (
    <ChevronRight size={12} className={cn("text-text-muted", state.expanded && "rotate-90")} />
  );
}

function MessagePartToolHeader({ children }: { children: ReactNode }) {
  const { actions } = useTool();

  return (
    <button
      type="button"
      onClick={actions.toggle}
      className="flex items-center gap-1.5 w-full px-4 py-1 text-xs cursor-pointer hover:bg-bg-hover"
    >
      {children}
    </button>
  );
}

function MessagePartToolDetails({ children }: { children: ReactNode }) {
  const { state } = useTool();
  if (!state.expanded) return null;
  return <div className="flex flex-col">{children}</div>;
}

const detailBlock = tv({
  base: "px-4 py-2 text-xs bg-bg-muted overflow-x-auto font-mono",
});

function MessagePartToolInput({ input }: { input: Record<string, unknown> }) {
  return <pre className={detailBlock()}>{JSON.stringify(input, null, 2)}</pre>;
}

function MessagePartToolOutput({ output }: { output: string }) {
  return <pre className={cn(detailBlock(), "max-h-40 overflow-y-auto")}>{output}</pre>;
}

function MessagePartToolError({ error }: { error: string }) {
  return <div className={cn(detailBlock(), "text-red-500")}>{error}</div>;
}

function MessagePartFile({ part }: { part: FilePart }) {
  return (
    <div className={actionRow()}>
      <span>{part.filename || part.url}</span>
      {part.source && "path" in part.source && (
        <span className="text-text-muted">{part.source.path}</span>
      )}
      <ChevronRight size={14} className="text-text-muted ml-auto" />
    </div>
  );
}

const metaRow = tv({
  base: "flex items-center gap-3 px-4 py-1.5 text-xs text-text-muted",
});

function MessagePartStepStart({}: { part: StepStartPart }) {
  return <div className={metaRow()} style={stripedBackground}></div>;
}

function MessagePartStepFinish({}: { part: StepFinishPart }) {
  return <div className={metaRow()} style={stripedBackground} />;
}

function MessagePartSnapshot({ part }: { part: SnapshotPart }) {
  return (
    <div className={metaRow()}>
      <span>Snapshot</span>
      <span className="font-mono">{part.id.slice(0, 8)}</span>
    </div>
  );
}

function MessagePartPatch({ part }: { part: PatchPart }) {
  return (
    <div className={metaRow()}>
      <span>Patch applied</span>
    </div>
  );
}

function MessagePartAgent({ part }: { part: AgentPart }) {
  return (
    <div className={actionRow()}>
      <Loader2 size={14} className="text-text-muted animate-spin" />
      <span>Agent task</span>
      <ChevronRight size={14} className="text-text-muted ml-auto" />
    </div>
  );
}

function MessagePartSubtask({ part }: { part: SubtaskPart }) {
  return (
    <div className={actionRow()}>
      <Loader2 size={14} className="text-text-muted animate-spin" />
      <span>{part.description}</span>
      <ChevronRight size={14} className="text-text-muted ml-auto" />
    </div>
  );
}

function MessagePartRetry({ part }: { part: RetryPart }) {
  return (
    <div className={cn(actionRow(), "text-yellow-500")}>
      <Loader2 size={14} className="animate-spin" />
      <span>Retrying...</span>
    </div>
  );
}

function MessagePartCompaction({ part }: { part: CompactionPart }) {
  return (
    <div className={metaRow()}>
      <span>Context compacted</span>
    </div>
  );
}

function MessagePartRoot({
  part,
  isStreaming,
  children,
}: {
  part: Part;
  isStreaming?: boolean;
  children?: ReactNode;
}) {
  if (children) {
    return <>{children}</>;
  }

  if (isTextPart(part)) {
    return <MessagePartText part={part} isStreaming={isStreaming} />;
  }

  if (isReasoningPart(part)) {
    return (
      <MessagePartReasoning part={part}>
        <MessagePartReasoningHeader>
          <MessagePartReasoningChevron />
          <span className="text-text-muted">Thinking</span>
        </MessagePartReasoningHeader>
        <MessagePartReasoningContent />
      </MessagePartReasoning>
    );
  }

  if (isToolPart(part)) {
    const status = part.state.status;
    const input = part.state.input;
    const output = status === "completed" ? part.state.output : null;
    const error = status === "error" ? part.state.error : null;

    return (
      <MessagePartTool part={part}>
        <MessagePartToolHeader>
          <MessagePartToolStatus />
          <MessagePartToolName />
          <MessagePartToolPath />
          <MessagePartToolDuration />
          <MessagePartToolChevron />
        </MessagePartToolHeader>
        <MessagePartToolDetails>
          {input && <MessagePartToolInput input={input} />}
          {output && <MessagePartToolOutput output={output} />}
          {error && <MessagePartToolError error={error} />}
        </MessagePartToolDetails>
      </MessagePartTool>
    );
  }

  if (isFilePart(part)) {
    return <MessagePartFile part={part} />;
  }

  if (isStepStartPart(part)) {
    return <MessagePartStepStart part={part} />;
  }

  if (isStepFinishPart(part)) {
    return <MessagePartStepFinish part={part} />;
  }

  if (isSnapshotPart(part)) {
    return <MessagePartSnapshot part={part} />;
  }

  if (isPatchPart(part)) {
    return <MessagePartPatch part={part} />;
  }

  if (isAgentPart(part)) {
    return <MessagePartAgent part={part} />;
  }

  if (isSubtaskPart(part)) {
    return <MessagePartSubtask part={part} />;
  }

  if (isRetryPart(part)) {
    return <MessagePartRetry part={part} />;
  }

  if (isCompactionPart(part)) {
    return <MessagePartCompaction part={part} />;
  }

  return null;
}

const MessagePart = {
  Root: MessagePartRoot,
  Text: MessagePartText,
  Reasoning: MessagePartReasoning,
  ReasoningHeader: MessagePartReasoningHeader,
  ReasoningChevron: MessagePartReasoningChevron,
  ReasoningContent: MessagePartReasoningContent,
  Tool: MessagePartTool,
  ToolHeader: MessagePartToolHeader,
  ToolStatus: MessagePartToolStatus,
  ToolName: MessagePartToolName,
  ToolPath: MessagePartToolPath,
  ToolDuration: MessagePartToolDuration,
  ToolChevron: MessagePartToolChevron,
  ToolDetails: MessagePartToolDetails,
  ToolInput: MessagePartToolInput,
  ToolOutput: MessagePartToolOutput,
  ToolError: MessagePartToolError,
  File: MessagePartFile,
  StepStart: MessagePartStepStart,
  StepFinish: MessagePartStepFinish,
  Snapshot: MessagePartSnapshot,
  Patch: MessagePartPatch,
  Agent: MessagePartAgent,
  Subtask: MessagePartSubtask,
  Retry: MessagePartRetry,
  Compaction: MessagePartCompaction,
};

export { MessagePart };
