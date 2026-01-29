"use client";

import { useState } from "react";
import { cn } from "@lab/ui/utils/cn";
import { Copy } from "@lab/ui/components/copy";
import { FileCode, ChevronDown, ChevronRight } from "lucide-react";
import type { PatchPart } from "@/lib/opencode/events/guards";

interface OpencodePartPatchProps {
  part: PatchPart;
}

export function OpencodePartPatch({ part }: OpencodePartPatchProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const fileCount = part.files.length;

  return (
    <div className="border-b last:border-b-0 border-border bg-muted/30 min-w-0">
      <button
        type="button"
        className="flex items-center gap-2 w-full px-4 py-2 text-muted-foreground hover:bg-muted/50 min-w-0"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <FileCode className="size-3 shrink-0 text-green-500" />
        <Copy as="span" size="xs">
          {fileCount} {fileCount === 1 ? "file" : "files"} changed
        </Copy>
        <span className="flex-1" />
        {isExpanded ? (
          <ChevronDown className="size-3 shrink-0" />
        ) : (
          <ChevronRight className="size-3 shrink-0" />
        )}
      </button>
      <div className={cn(isExpanded ? "max-h-125 overflow-y-auto" : "hidden")}>
        <div className="px-4 py-2 space-y-1 min-w-0">
          {part.files.map((file) => (
            <div key={file} className="flex items-center gap-2 min-w-0">
              <Copy as="span" size="xs" muted className="truncate font-mono">
                {file}
              </Copy>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
