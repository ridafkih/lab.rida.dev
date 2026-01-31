"use client";

import { createContext, use, useState, type ReactNode } from "react";
import { tv } from "tailwind-variants";
import { TextAreaGroup } from "./textarea-group";
import { Tabs, useTabs } from "./tabs";

type ChatRole = "user" | "assistant";

type SubmitOptions = {
  content: string;
  modelId?: string;
};

type ChatState = {
  input: string;
  modelId: string | null;
};

type ChatActions = {
  setInput: (value: string) => void;
  setModelId: (value: string) => void;
  onSubmit: () => void;
};

type ChatContextValue = {
  state: ChatState;
  actions: ChatActions;
};

const ChatContext = createContext<ChatContextValue | null>(null);

function useChat() {
  const context = use(ChatContext);
  if (!context) {
    throw new Error("Chat components must be used within Chat.Provider");
  }
  return context;
}

function ChatProvider({
  children,
  defaultModelId,
  onSubmit,
}: {
  children: ReactNode;
  defaultModelId?: string;
  onSubmit?: (options: SubmitOptions) => void;
}) {
  const [input, setInput] = useState("");
  const [modelId, setModelId] = useState(defaultModelId ?? null);

  const handleSubmit = () => {
    if (!input.trim()) return;
    onSubmit?.({ content: input, modelId: modelId ?? undefined });
    setInput("");
  };

  return (
    <ChatContext
      value={{
        state: { input, modelId },
        actions: { setInput, setModelId, onSubmit: handleSubmit },
      }}
    >
      {children}
    </ChatContext>
  );
}

function ChatFrame({ children }: { children: ReactNode }) {
  return <div className="relative flex flex-col h-full">{children}</div>;
}

function ChatHeader({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border">{children}</div>
  );
}

function ChatHeaderBreadcrumb({ children }: { children: ReactNode }) {
  return <div className="flex items-center gap-1">{children}</div>;
}

function ChatHeaderProject({ children }: { children: ReactNode }) {
  return <span className="text-text-muted text-nowrap overflow-x-hidden truncate">{children}</span>;
}

function ChatHeaderDivider() {
  return <span className="text-text-muted">/</span>;
}

function ChatHeaderTitle({ children }: { children: ReactNode }) {
  return (
    <span className="text-text font-medium text-nowrap overflow-x-hidden truncate">{children}</span>
  );
}

function ChatHeaderEmptyTitle({ children }: { children: ReactNode }) {
  return (
    <span className="text-text-muted italic text-nowrap overflow-x-hidden truncate">
      {children}
    </span>
  );
}

type ChatTab = "chat" | "review" | "frame" | "stream";

function ChatTabs({
  children,
  defaultTab = "chat",
}: {
  children: ReactNode;
  defaultTab?: ChatTab;
}) {
  return <Tabs.Root<ChatTab> defaultTab={defaultTab}>{children}</Tabs.Root>;
}

function ChatTabItem({ value, children }: { value: ChatTab; children: ReactNode }) {
  return <Tabs.Tab<ChatTab> value={value}>{children}</Tabs.Tab>;
}

function ChatTabContent({ value, children }: { value: ChatTab; children: ReactNode }) {
  return <Tabs.Content<ChatTab> value={value}>{children}</Tabs.Content>;
}

function ChatMessageList({ children }: { children: ReactNode }) {
  return <div className="flex-1 overflow-y-auto flex flex-col justify-between">{children}</div>;
}

function ChatMessages({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-px bg-border not-empty:pb-px">{children}</div>;
}

const block = tv({
  base: "",
  variants: {
    role: {
      user: "bg-bg",
      assistant: "bg-bg-muted",
    },
  },
});

function ChatBlock({ role, children }: { role: ChatRole; children: ReactNode }) {
  return <div className={block({ role })}>{children}</div>;
}

function ChatInput({ children }: { children?: ReactNode }) {
  const { state, actions } = useChat();

  return (
    <div className="sticky bottom-0 px-4 pb-4 pt-2 bg-linear-to-t from-bg to-transparent pointer-events-none">
      <TextAreaGroup.Provider
        state={{ value: state.input }}
        actions={{
          onChange: actions.setInput,
          onSubmit: actions.onSubmit,
        }}
      >
        <TextAreaGroup.Frame>
          <TextAreaGroup.Input placeholder="Send a message..." rows={2} />
          <TextAreaGroup.Toolbar>
            {children}
            <TextAreaGroup.Submit />
          </TextAreaGroup.Toolbar>
        </TextAreaGroup.Frame>
      </TextAreaGroup.Provider>
    </div>
  );
}

const Chat = {
  Provider: ChatProvider,
  Frame: ChatFrame,
  Header: ChatHeader,
  HeaderBreadcrumb: ChatHeaderBreadcrumb,
  HeaderProject: ChatHeaderProject,
  HeaderDivider: ChatHeaderDivider,
  HeaderTitle: ChatHeaderTitle,
  HeaderEmptyTitle: ChatHeaderEmptyTitle,
  Tabs: ChatTabs,
  TabList: Tabs.List,
  Tab: ChatTabItem,
  TabContent: ChatTabContent,
  MessageList: ChatMessageList,
  Messages: ChatMessages,
  Block: ChatBlock,
  Input: ChatInput,
};

export { Chat, useChat, useTabs, type ChatRole, type ChatTab };
