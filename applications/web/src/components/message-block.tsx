"use client";

import { cn } from "@lab/ui/utils/cn";
import { Streamdown } from "streamdown";
import { code } from "@streamdown/code";
import { streamdownComponents } from "./streamdown-components";

interface MessageBlockProps {
  children: string;
  variant?: "user" | "assistant";
  isStreaming?: boolean;
}

export function MessageBlock({
  children,
  variant = "user",
  isStreaming = false,
}: MessageBlockProps) {
  if (!children.trim()) {
    return null;
  }

  const isAssistant = variant === "assistant";

  return (
    <div
      data-opencode-part="text"
      className={cn("border-b border-border px-4 py-3", isAssistant && "bg-muted")}
    >
      <Streamdown plugins={{ code }} components={streamdownComponents} isAnimating={isStreaming}>
        {children}
      </Streamdown>
    </div>
  );
}
