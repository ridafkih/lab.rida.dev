"use client";

import { Copy } from "@lab/ui/components/copy";
import { Bot } from "lucide-react";
import type { AgentPart } from "@/lib/opencode/events/guards";

interface OpencodePartAgentProps {
  part: AgentPart;
}

export function OpencodePartAgent({ part }: OpencodePartAgentProps) {
  return (
    <div className="flex items-center gap-2 px-4 py-2 border-b last:border-b-0 border-border bg-muted/30">
      <Bot className="size-3 text-blue-500" />
      <Copy as="span" size="xs" muted>
        Agent: {part.name}
      </Copy>
    </div>
  );
}
