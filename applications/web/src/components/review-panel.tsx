"use client";

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { Button } from "@lab/ui/components/button";
import { EmptyState } from "@lab/ui/components/empty-state";
import { MultiFileDiff, File } from "@pierre/diffs/react";
import type { FileContents, SelectedLineRange } from "@pierre/diffs";
import { Check, Send, FileText, Loader2 } from "lucide-react";
import type { ReviewableFile } from "@/types/review";
import {
  DismissibleFileHeader,
  DismissibleFileHeaderDismiss,
  DismissibleFileHeaderIcon,
  DismissibleFileHeaderLabel,
} from "./dismissible-file-header";
import {
  SelectionFeedbackForm,
  SelectionFeedbackFormHeader,
  SelectionFeedbackFormLocation,
  SelectionFeedbackFormTextarea,
  SelectionFeedbackFormActions,
} from "./selection-feedback-form";
import { FileBrowserPanel } from "./file-browser";
import { useFileBrowser } from "@/lib/opencode/hooks/use-file-browser";

interface ReviewPanelProps {
  files: ReviewableFile[];
  onDismiss: (path: string) => void;
  labSessionId: string;
}

interface LineSelection {
  filePath: string;
  range: SelectedLineRange;
}

export function ReviewPanel({ files, onDismiss, labSessionId }: ReviewPanelProps) {
  const [selection, setSelection] = useState<LineSelection | null>(null);
  const prevSelectionRef = useRef<LineSelection | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const pendingFiles = useMemo(() => files.filter((file) => file.status === "pending"), [files]);

  const {
    rootNodes,
    expandedPaths,
    loadedContents,
    selectedPath,
    previewContent,
    rootLoading,
    loadingPaths,
    previewLoading,
    toggleDirectory,
    selectFile,
    clearSelection: clearFileSelection,
  } = useFileBrowser({ labSessionId });

  useEffect(() => {
    if (selection) {
      textareaRef.current?.focus();
    }
    prevSelectionRef.current = selection;
  }, [selection]);

  const handleLineSelected = useCallback((filePath: string, range: SelectedLineRange | null) => {
    if (range) {
      setSelection({ filePath, range });
    } else {
      setSelection((prev) => (prev?.filePath === filePath ? null : prev));
    }
  }, []);

  const clearSelection = useCallback(() => {
    setSelection(null);
  }, []);

  const renderFilePreview = () => {
    if (previewLoading) {
      return (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      );
    }

    if (!previewContent) {
      return (
        <div className="flex-1 flex items-center justify-center">
          <EmptyState
            icon={<FileText className="size-8 text-muted-foreground" />}
            title="Unable to load file"
            description="Failed to load file content"
          />
        </div>
      );
    }

    const previewFile: FileContents = {
      name: selectedPath!,
      contents: previewContent.content,
    };

    const shouldClearSelection =
      prevSelectionRef.current?.filePath === selectedPath && selection?.filePath !== selectedPath;

    return (
      <div className="flex flex-col flex-1 min-h-0 min-w-0">
        <div className="flex-1 overflow-auto min-w-0">
          <div className="border-b border-border min-w-0">
            <DismissibleFileHeader>
              <DismissibleFileHeaderLabel>{selectedPath}</DismissibleFileHeaderLabel>
              <Button variant="secondary" size="sm" onClick={clearFileSelection}>
                Close
              </Button>
            </DismissibleFileHeader>
            <File
              file={previewFile}
              selectedLines={shouldClearSelection ? null : undefined}
              options={{
                theme: "pierre-light",
                overflow: "scroll",
                disableFileHeader: true,
                enableLineSelection: true,
                onLineSelected: (range) => handleLineSelected(selectedPath!, range),
                unsafeCSS: `
                  * { user-select: none; }
                  [data-line] { position: relative; }
                  [data-column-number] { position: static; cursor: crosshair; }
                  [data-column-number]::after {
                    content: "";
                    position: absolute;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                  }
                `,
              }}
              style={
                {
                  "--diffs-font-size": "12px",
                  minWidth: 0,
                } as React.CSSProperties
              }
            />
          </div>
        </div>

        {selection && selection.filePath === selectedPath && (
          <SelectionFeedbackForm>
            <SelectionFeedbackFormHeader onClose={clearSelection}>
              <SelectionFeedbackFormLocation
                filePath={selection.filePath}
                startLine={selection.range.start}
                endLine={selection.range.end}
              />
            </SelectionFeedbackFormHeader>
            <SelectionFeedbackFormTextarea
              ref={textareaRef}
              placeholder="Provide feedback on this selection..."
            />
            <SelectionFeedbackFormActions>
              <Button variant="primary" icon={<Send className="size-3" />}>
                Send
              </Button>
            </SelectionFeedbackFormActions>
          </SelectionFeedbackForm>
        )}
      </div>
    );
  };

  const renderDiffPanel = () => {
    if (files.length === 0) {
      return (
        <div className="flex-1 flex items-center justify-center">
          <EmptyState
            icon={<Check className="size-8 text-success" />}
            title="All caught up"
            description="No files to review"
          />
        </div>
      );
    }

    if (pendingFiles.length === 0) {
      return (
        <div className="flex-1 flex items-center justify-center">
          <EmptyState
            icon={<Check className="size-8 text-success" />}
            title="All files reviewed"
            description="All files have been dismissed"
          />
        </div>
      );
    }

    return (
      <div className="flex flex-col flex-1 min-h-0 min-w-0">
        <div className="flex-1 overflow-auto min-w-0">
          {pendingFiles.map((file) => {
            const oldFile: FileContents = {
              name: file.path,
              contents: file.changeType === "created" ? "" : file.originalContent,
            };
            const newFile: FileContents = {
              name: file.path,
              contents: file.changeType === "deleted" ? "" : file.currentContent,
            };
            const shouldClearSelection =
              prevSelectionRef.current?.filePath === file.path && selection?.filePath !== file.path;

            return (
              <div key={file.path} className="border-b border-border min-w-0">
                <DismissibleFileHeader>
                  <DismissibleFileHeaderIcon changeType={file.changeType} />
                  <DismissibleFileHeaderLabel>{file.path}</DismissibleFileHeaderLabel>
                  <DismissibleFileHeaderDismiss onDismiss={() => onDismiss(file.path)} />
                </DismissibleFileHeader>
                <MultiFileDiff
                  oldFile={oldFile}
                  newFile={newFile}
                  selectedLines={shouldClearSelection ? null : undefined}
                  options={{
                    theme: "pierre-light",
                    diffStyle: "split",
                    hunkSeparators: "line-info",
                    lineDiffType: "word-alt",
                    overflow: "scroll",
                    disableFileHeader: true,
                    enableLineSelection: true,
                    onLineSelected: (range) => handleLineSelected(file.path, range),
                    unsafeCSS: `
                      * { user-select: none; }
                      [data-line] { position: relative; }
                      [data-column-number] { position: static; cursor: crosshair; }
                      [data-column-number]::after {
                        content: "";
                        position: absolute;
                        top: 0;
                        left: 0;
                        right: 0;
                        bottom: 0;
                      }
                    `,
                  }}
                  style={
                    {
                      "--diffs-font-size": "12px",
                      minWidth: 0,
                    } as React.CSSProperties
                  }
                />
              </div>
            );
          })}
        </div>

        {selection && (
          <SelectionFeedbackForm>
            <SelectionFeedbackFormHeader onClose={clearSelection}>
              <SelectionFeedbackFormLocation
                filePath={selection.filePath}
                startLine={selection.range.start}
                endLine={selection.range.end}
              />
            </SelectionFeedbackFormHeader>
            <SelectionFeedbackFormTextarea
              ref={textareaRef}
              placeholder="Provide feedback on this selection..."
            />
            <SelectionFeedbackFormActions>
              <Button variant="primary" icon={<Send className="size-3" />}>
                Send
              </Button>
            </SelectionFeedbackFormActions>
          </SelectionFeedbackForm>
        )}
      </div>
    );
  };

  const renderMainPanel = () => {
    if (selectedPath) {
      return renderFilePreview();
    }
    return renderDiffPanel();
  };

  return (
    <div className="flex flex-1 min-h-0 min-w-0">
      <div className="flex-1 flex flex-col min-w-0">{renderMainPanel()}</div>
      <div className="w-64 shrink-0">
        <FileBrowserPanel
          rootNodes={rootNodes}
          expandedPaths={expandedPaths}
          loadedContents={loadedContents}
          loadingPaths={loadingPaths}
          selectedPath={selectedPath}
          rootLoading={rootLoading}
          onToggleDirectory={toggleDirectory}
          onSelectFile={selectFile}
        />
      </div>
    </div>
  );
}
