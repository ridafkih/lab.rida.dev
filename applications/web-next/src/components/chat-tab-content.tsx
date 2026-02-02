"use client";

import { useEffect, useRef, useState } from "react";
import { Chat, useChat } from "@/components/chat";
import { TextAreaGroup } from "@/components/textarea-group";
import { MessagePart } from "@/components/message-part";
import { QuestionProvider } from "@/lib/question-context";
import { useModelSelection } from "@/lib/hooks";
import { useSessionStatus } from "@/lib/use-session-status";
import { useSessionContext } from "@/app/editor/[sessionId]/layout";
import type { MessageState, SessionStatus } from "@/lib/use-agent";

type ChatTabContentProps = {
  messages: MessageState[];
  onQuestionReply: (callId: string, answers: string[][]) => Promise<void>;
  onQuestionReject: (callId: string) => Promise<void>;
  isQuestionSubmitting: boolean;
  sessionStatus: SessionStatus;
  onAbort: () => void;
};

export function ChatTabContent({
  messages,
  onQuestionReply,
  onQuestionReject,
  isQuestionSubmitting,
  sessionStatus,
  onAbort,
}: ChatTabContentProps) {
  const { session } = useSessionContext();
  const status = useSessionStatus(session);
  const isGenerating = status === "generating" || sessionStatus.type === "busy";
  const [rateLimitMessage, setRateLimitMessage] = useState<string | null>(null);
  const { state, actions } = useChat();
  const { modelGroups, modelId, setModelId } = useModelSelection({
    syncTo: actions.setModelId,
    currentSyncedValue: state.modelId,
  });
  const isStreamingRef = useRef(false);

  const lastMessage = messages[messages.length - 1];
  const isStreaming = lastMessage?.role === "assistant";

  useEffect(() => {
    if (isStreaming) {
      isStreamingRef.current = true;
      actions.scrollToBottom();
    } else if (isStreamingRef.current) {
      isStreamingRef.current = false;
    }
  }, [isStreaming, lastMessage?.parts.length, actions]);

  useEffect(() => {
    if (sessionStatus.type === "retry") {
      onAbort();
      setRateLimitMessage("Rate limited. Try a different model.");
    }
  }, [sessionStatus, onAbort]);

  useEffect(() => {
    setRateLimitMessage(null);
  }, [modelId]);

  return (
    <QuestionProvider
      onReply={onQuestionReply}
      onReject={onQuestionReject}
      isSubmitting={isQuestionSubmitting}
    >
      <Chat.MessageList>
        <Chat.Messages>
          {messages.flatMap((message) =>
            message.parts.map((part) => (
              <Chat.Block key={part.id} role={message.role}>
                <MessagePart.Root
                  part={part}
                  isStreaming={
                    message.role === "assistant" && message === messages[messages.length - 1]
                  }
                />
              </Chat.Block>
            )),
          )}
        </Chat.Messages>
        <Chat.Input isSending={isGenerating} statusMessage={rateLimitMessage}>
          {modelGroups && modelId && (
            <TextAreaGroup.ModelSelector
              value={modelId}
              groups={modelGroups}
              onChange={setModelId}
            />
          )}
        </Chat.Input>
      </Chat.MessageList>
    </QuestionProvider>
  );
}
