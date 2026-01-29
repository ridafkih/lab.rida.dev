"use client";

import { useState } from "react";
import { cn } from "@lab/ui/utils/cn";
import { Copy } from "@lab/ui/components/copy";
import { ListTodo, ChevronDown, ChevronRight } from "lucide-react";
import type { SubtaskPart } from "@/lib/opencode/events/guards";

interface OpencodePartSubtaskProps {
  part: SubtaskPart;
}

export function OpencodePartSubtask({ part }: OpencodePartSubtaskProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="border-b last:border-b-0 border-border bg-muted/30 min-w-0">
      <button
        type="button"
        className="flex items-center gap-2 w-full px-4 py-2 text-muted-foreground hover:bg-muted/50 min-w-0"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <ListTodo className="size-3 shrink-0 text-orange-500" />
        <Copy as="span" size="xs" className="truncate">
          {part.description || "Subtask"}
        </Copy>
        {part.agent && (
          <Copy as="span" size="xs" muted className="shrink-0">
            ({part.agent})
          </Copy>
        )}
        <span className="flex-1" />
        {isExpanded ? (
          <ChevronDown className="size-3 shrink-0" />
        ) : (
          <ChevronRight className="size-3 shrink-0" />
        )}
      </button>
      <div className={cn(isExpanded ? "max-h-125 overflow-y-auto" : "hidden")}>
        <div className="px-4 py-3 space-y-2 min-w-0">
          <div className="min-w-0">
            <p className="text-xs font-sans text-muted-foreground mb-1">Prompt</p>
            <pre className="text-xs font-mono bg-background p-2 rounded overflow-x-auto w-0 min-w-full whitespace-pre-wrap">
              {part.prompt}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}
