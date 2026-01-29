"use client";

import type { ReactNode } from "react";
import type { MessageState } from "@/lib/opencode/state/types";
import { MessageBlock } from "./message-block";
import { OpencodePartReasoning } from "./opencode/opencode-part-reasoning";
import { OpencodePartTool } from "./opencode/opencode-part-tool";
import { OpencodePartFile } from "./opencode/opencode-part-file";
import { OpencodePartStepStart } from "./opencode/opencode-part-step-start";
import { OpencodePartStepFinish } from "./opencode/opencode-part-step-finish";
import { OpencodePartAgent } from "./opencode/opencode-part-agent";
import { OpencodePartSubtask } from "./opencode/opencode-part-subtask";
import { OpencodePartRetry } from "./opencode/opencode-part-retry";
import { OpencodePartSnapshot } from "./opencode/opencode-part-snapshot";
import { OpencodePartPatch } from "./opencode/opencode-part-patch";
import { OpencodePartCompaction } from "./opencode/opencode-part-compaction";
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
} from "@/lib/opencode/events/guards";

interface OpencodePartsProps {
  messageState: MessageState;
}

export function OpencodeParts({ messageState }: OpencodePartsProps) {
  const { info, parts, partOrder, isStreaming, streamingPartId } = messageState;
  const isAssistant = info.role === "assistant";

  const elements: ReactNode[] = [];
  let accumulatedText = "";
  let accumulatedTextIsStreaming = false;

  const flushText = () => {
    if (accumulatedText) {
      elements.push(
        <MessageBlock
          key={`text-${elements.length}`}
          variant={isAssistant ? "assistant" : "user"}
          isStreaming={accumulatedTextIsStreaming}
        >
          {accumulatedText}
        </MessageBlock>,
      );
      accumulatedText = "";
      accumulatedTextIsStreaming = false;
    }
  };

  for (let i = 0; i < partOrder.length; i++) {
    const partId = partOrder[i];
    const partState = parts.get(partId);
    if (!partState) continue;

    const { part, delta } = partState;
    const isCurrentlyStreaming = isStreaming && streamingPartId === partId;
    const isLastPart = i === partOrder.length - 1;

    if (isTextPart(part)) {
      if (part.synthetic) continue;
      const text = delta || part.text;
      accumulatedText += text;
      if (isCurrentlyStreaming) {
        accumulatedTextIsStreaming = true;
      }
      continue;
    }

    flushText();

    if (isReasoningPart(part)) {
      elements.push(
        <OpencodePartReasoning
          key={partId}
          part={part}
          delta={delta}
          isStreaming={isCurrentlyStreaming}
        />,
      );
      continue;
    }

    if (isToolPart(part)) {
      elements.push(<OpencodePartTool key={partId} part={part} />);
      continue;
    }

    if (isFilePart(part)) {
      elements.push(<OpencodePartFile key={partId} part={part} />);
      continue;
    }

    if (isStepStartPart(part)) {
      if (isLastPart) {
        elements.push(<OpencodePartStepStart key={partId} part={part} />);
      }
      continue;
    }

    if (isStepFinishPart(part)) {
      elements.push(<OpencodePartStepFinish key={partId} part={part} />);
      continue;
    }

    if (isAgentPart(part)) {
      elements.push(<OpencodePartAgent key={partId} part={part} />);
      continue;
    }

    if (isSubtaskPart(part)) {
      elements.push(<OpencodePartSubtask key={partId} part={part} />);
      continue;
    }

    if (isRetryPart(part)) {
      elements.push(<OpencodePartRetry key={partId} part={part} />);
      continue;
    }

    if (isSnapshotPart(part)) {
      elements.push(<OpencodePartSnapshot key={partId} part={part} />);
      continue;
    }

    if (isPatchPart(part)) {
      elements.push(<OpencodePartPatch key={partId} part={part} />);
      continue;
    }

    if (isCompactionPart(part)) {
      elements.push(<OpencodePartCompaction key={partId} part={part} />);
      continue;
    }
  }

  flushText();

  if (elements.length === 0 && !isAssistant) {
    return null;
  }

  return <>{elements}</>;
}
