"use client";

import { createContext, use, useState, type ReactNode } from "react";
import { tv } from "tailwind-variants";
import { TextAreaGroup } from "./textarea-group";

type ChatRole = "user" | "assistant";

type ChatState = {
  input: string;
};

type ChatActions = {
  setInput: (value: string) => void;
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
  onSubmit,
}: {
  children: ReactNode;
  onSubmit?: (input: string) => void;
}) {
  const [input, setInput] = useState("");

  const handleSubmit = () => {
    if (!input.trim()) return;
    onSubmit?.(input);
    setInput("");
  };

  return (
    <ChatContext value={{ state: { input }, actions: { setInput, onSubmit: handleSubmit } }}>
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
  return <span className="text-text-muted">{children}</span>;
}

function ChatHeaderDivider() {
  return <span className="text-text-muted">/</span>;
}

function ChatHeaderTitle({ children }: { children: ReactNode }) {
  return <span className="text-text font-medium">{children}</span>;
}

function ChatMessageList({ children }: { children: ReactNode }) {
  return <div className="flex-1 overflow-y-auto">{children}</div>;
}

function ChatMessages({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-px bg-border pb-px">{children}</div>;
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
  MessageList: ChatMessageList,
  Messages: ChatMessages,
  Block: ChatBlock,
  Input: ChatInput,
};

export { Chat, useChat, type ChatRole };
