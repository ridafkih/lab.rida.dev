"use client";

import { Copy } from "@lab/ui/components/copy";
import { RefreshCw } from "lucide-react";
import type { RetryPart } from "@/lib/opencode/events/guards";

interface OpencodePartRetryProps {
  part: RetryPart;
}

export function OpencodePartRetry({ part }: OpencodePartRetryProps) {
  return (
    <div className="flex items-center gap-2 px-4 py-2 border-b last:border-b-0 border-border bg-yellow-500/10">
      <RefreshCw className="size-3 text-yellow-500" />
      <Copy as="span" size="xs" className="text-yellow-600 dark:text-yellow-400">
        Retry attempt {part.attempt}
      </Copy>
      <Copy as="span" size="xs" muted className="truncate">
        {part.error.data.message}
      </Copy>
    </div>
  );
}
