"use client";

import { Copy } from "@lab/ui/components/copy";
import { Camera } from "lucide-react";
import type { SnapshotPart } from "@/lib/opencode/events/guards";

interface OpencodePartSnapshotProps {
  part: SnapshotPart;
}

export function OpencodePartSnapshot({ part }: OpencodePartSnapshotProps) {
  return (
    <div
      data-opencode-part="snapshot"
      className="flex items-center gap-2 px-4 py-1 border-b last:border-b-0 border-border bg-muted/20"
    >
      <Camera className="size-3 text-muted-foreground" />
      <Copy as="span" size="xs" muted className="truncate font-mono">
        {part.snapshot}
      </Copy>
    </div>
  );
}
