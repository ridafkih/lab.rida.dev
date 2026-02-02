"use client";

import {
  createContext,
  use,
  useState,
  useRef,
  useCallback,
  type ReactNode,
  type RefObject,
} from "react";
import { tv } from "tailwind-variants";
import { TextAreaGroup } from "./textarea-group";
import { Tabs, useTabs } from "./tabs";
import { PageFrame, Header } from "./layout-primitives";

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
  onAbort: () => void;
  scrollToBottom: (force?: boolean) => void;
};

type ChatContextValue = {
  state: ChatState;
  actions: ChatActions;
  scrollRef: RefObject<HTMLDivElement | null>;
  isNearBottomRef: RefObject<boolean>;
};

const ChatContext = createContext<ChatContextValue | null>(null);

function useChat() {
  const context = use(ChatContext);
  if (!context) {
    throw new Error("Chat components must be used within Chat.Provider");
  }
  return context;
}

const SCROLL_THRESHOLD = 100;

function ChatProvider({
  children,
  defaultModelId,
  onSubmit,
  onAbort,
}: {
  children: ReactNode;
  defaultModelId?: string;
  onSubmit?: (options: SubmitOptions) => void;
  onAbort?: () => void;
}) {
  const [input, setInput] = useState("");
  const [modelId, setModelId] = useState(defaultModelId ?? null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const isNearBottomRef = useRef(true);

  const scrollToBottom = useCallback((force = false) => {
    if (!force && !isNearBottomRef.current) return;
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
    });
  }, []);

  const handleSubmit = () => {
    if (!input.trim()) return;
    onSubmit?.({ content: input, modelId: modelId ?? undefined });
    setInput("");
    isNearBottomRef.current = true;
    setTimeout(() => scrollToBottom(true), 0);
  };

  const handleAbort = () => {
    onAbort?.();
  };

  return (
    <ChatContext
      value={{
        state: { input, modelId },
        actions: {
          setInput,
          setModelId,
          onSubmit: handleSubmit,
          onAbort: handleAbort,
          scrollToBottom,
        },
        scrollRef,
        isNearBottomRef,
      }}
    >
      {children}
    </ChatContext>
  );
}

function ChatFrame({ children }: { children: ReactNode }) {
  return <PageFrame position="relative">{children}</PageFrame>;
}

function ChatHeader({ children }: { children: ReactNode }) {
  return <Header>{children}</Header>;
}

function ChatHeaderBreadcrumb({ children }: { children: ReactNode }) {
  return <div className="flex items-center gap-1 overflow-x-hidden">{children}</div>;
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
  const { scrollRef, isNearBottomRef } = useChat();

  const handleScroll = useCallback(() => {
    const { current: element } = scrollRef;
    if (!element) return;
    const { scrollHeight, scrollTop, clientHeight } = element;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;

    isNearBottomRef.current = distanceFromBottom < SCROLL_THRESHOLD;
  }, [scrollRef, isNearBottomRef]);

  return (
    <div
      ref={scrollRef}
      onScroll={handleScroll}
      className="flex-1 overflow-y-auto flex flex-col justify-between"
    >
      {children}
    </div>
  );
}

function ChatMessages({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-px bg-border not-empty:pb-px">{children}</div>;
}

const block = tv({
  base: "empty:hidden",
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

function ChatInput({
  children,
  isSending,
  statusMessage,
}: {
  children?: ReactNode;
  isSending?: boolean;
  statusMessage?: string | null;
}) {
  const { state, actions } = useChat();

  return (
    <div className="sticky bottom-0 p-4 bg-linear-to-t from-bg to-transparent pointer-events-none z-10">
      {statusMessage && (
        <div className="mb-2 px-3 py-1.5 bg-amber-950 text-amber-500 border border-amber-900 text-xs pointer-events-auto">
          {statusMessage}
        </div>
      )}
      <TextAreaGroup.Provider
        state={{ value: state.input }}
        actions={{
          onChange: actions.setInput,
          onSubmit: actions.onSubmit,
          onAbort: actions.onAbort,
        }}
        meta={{ isSending }}
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
