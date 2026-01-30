"use client";

import { cn } from "@lab/ui/utils/cn";
import { Copy } from "@lab/ui/components/copy";
import { File, Image, FileText, FileCode, FileArchive } from "lucide-react";
import type { FilePart } from "@opencode-ai/sdk/client";

interface OpencodePartFileProps {
  part: FilePart;
}

function getFileIcon(mime: string) {
  if (mime.startsWith("image/")) return Image;
  if (mime === "application/pdf") return FileText;
  if (mime.startsWith("text/") || mime.includes("json") || mime.includes("javascript"))
    return FileCode;
  if (mime.includes("zip") || mime.includes("tar") || mime.includes("gzip")) return FileArchive;
  return File;
}

export function OpencodePartFile({ part }: OpencodePartFileProps) {
  const Icon = getFileIcon(part.mime);
  const isImage = part.mime.startsWith("image/");

  return (
    <div
      data-opencode-part="file"
      className="border-b last:border-b-0 border-border bg-muted/30 min-w-0"
    >
      {isImage && part.url ? (
        <div className="p-4">
          <img
            src={part.url}
            alt={part.filename}
            className="max-w-full max-h-64 rounded border border-border"
          />
          <Copy as="p" size="xs" muted className="mt-2">
            {part.filename}
          </Copy>
        </div>
      ) : (
        <a
          href={part.url}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            "flex items-center gap-2 px-4 py-2 text-muted-foreground hover:bg-muted/50 min-w-0",
          )}
        >
          <Icon className="size-3 shrink-0" />
          <Copy as="span" size="xs" className="truncate">
            {part.filename}
          </Copy>
        </a>
      )}
    </div>
  );
}
