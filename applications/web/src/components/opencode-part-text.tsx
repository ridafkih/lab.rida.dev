"use client";

import type { TextPart } from "@opencode-ai/sdk/client";
import { MessageBlock } from "./message-block";

interface OpencodePartTextProps {
  part: TextPart;
  delta?: string;
  isStreaming?: boolean;
  variant: "user" | "assistant";
}

export function OpencodePartText({
  part,
  delta,
  isStreaming = false,
  variant,
}: OpencodePartTextProps) {
  if (part.synthetic) {
    return null;
  }

  const text = delta || part.text;

  return (
    <MessageBlock variant={variant} isStreaming={isStreaming}>
      {text}
    </MessageBlock>
  );
}
