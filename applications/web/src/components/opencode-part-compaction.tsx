"use client";

import { Copy } from "@lab/ui/components/copy";
import { Minimize2 } from "lucide-react";
import type { CompactionPart } from "@/lib/opencode/events/guards";

interface OpencodePartCompactionProps {
  part: CompactionPart;
}

export function OpencodePartCompaction({ part }: OpencodePartCompactionProps) {
  return (
    <div
      data-opencode-part="compaction"
      className="flex items-center gap-2 px-4 py-1 border-b last:border-b-0 border-border bg-muted/20"
    >
      <Minimize2 className="size-3 text-muted-foreground" />
      <Copy as="span" size="xs" muted>
        Context compacted{part.auto ? " (auto)" : ""}
      </Copy>
    </div>
  );
}
