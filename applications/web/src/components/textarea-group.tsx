"use client";

import { ChevronDown, Paperclip, Send, Square } from "lucide-react";
import {
  createContext,
  type DragEvent,
  type ReactNode,
  type RefObject,
  use,
  useRef,
} from "react";
import { cn } from "@/lib/cn";
import type { Attachment } from "@/lib/use-attachments";
import { AttachmentPreview } from "./attachment-preview";
import { IconButton } from "./icon-button";

interface TextAreaGroupState {
  attachments?: Attachment[];
}

interface TextAreaGroupActions {
  onSubmit: () => void;
  onAbort?: () => void;
  onAddFiles?: (files: FileList | File[]) => void;
  onRemoveAttachment?: (id: string) => void;
}

interface TextAreaGroupMeta {
  textareaRef?: RefObject<HTMLTextAreaElement | null>;
  isSending?: boolean;
  isDragging?: boolean;
  dragHandlers?: {
    onDragEnter: (event: DragEvent) => void;
    onDragLeave: (event: DragEvent) => void;
    onDragOver: (event: DragEvent) => void;
    onDrop: (event: DragEvent) => void;
  };
}

interface TextAreaGroupContextValue {
  state: TextAreaGroupState;
  actions: TextAreaGroupActions;
  meta: TextAreaGroupMeta;
}

const TextAreaGroupContext = createContext<TextAreaGroupContextValue | null>(
  null
);

function useTextAreaGroup() {
  const context = use(TextAreaGroupContext);
  if (!context) {
    throw new Error(
      "TextAreaGroup components must be used within TextAreaGroup.Provider"
    );
  }
  return context;
}

interface ProviderProps {
  children: ReactNode;
  state: TextAreaGroupState;
  actions: TextAreaGroupActions;
  meta?: TextAreaGroupMeta;
}

function TextAreaGroupProvider({
  children,
  state,
  actions,
  meta = {},
}: ProviderProps) {
  return (
    <TextAreaGroupContext value={{ state, actions, meta }}>
      {children}
    </TextAreaGroupContext>
  );
}

interface FrameProps {
  children: ReactNode;
}

function TextAreaGroupFrame({ children }: FrameProps) {
  const { meta } = useTextAreaGroup();

  return (
    <div
      className={cn(
        "pointer-events-auto relative flex flex-col overflow-hidden border border-border bg-bg-muted",
        meta.isDragging && "border-blue-500 border-dashed"
      )}
      {...meta.dragHandlers}
    >
      {meta.isDragging && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-blue-500/10">
          <span className="font-medium text-blue-500 text-sm">
            Drop images here
          </span>
        </div>
      )}
      {children}
    </div>
  );
}

interface InputProps {
  placeholder?: string;
  rows?: number;
}

function extractImagesFromClipboard(clipboardData: DataTransfer): File[] {
  const images: File[] = [];

  for (const item of clipboardData.items) {
    if (item.type.startsWith("image/")) {
      const file = item.getAsFile();
      if (file) {
        images.push(file);
      }
    }
  }

  return images;
}

function TextAreaGroupInput({
  placeholder = "Describe a task to provide context to the orchestrator...",
  rows = 5,
}: InputProps) {
  const { actions, meta } = useTextAreaGroup();

  const handlePaste = (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    if (!(actions.onAddFiles && event.clipboardData)) {
      return;
    }

    const images = extractImagesFromClipboard(event.clipboardData);
    if (images.length > 0) {
      event.preventDefault();
      actions.onAddFiles(images);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      actions.onSubmit();
    }
  };

  return (
    <textarea
      className="w-full resize-none bg-transparent p-3 text-sm placeholder:text-text-muted focus:outline-none"
      onKeyDown={handleKeyDown}
      onPaste={handlePaste}
      placeholder={placeholder}
      ref={meta.textareaRef}
      rows={rows}
    />
  );
}

function TextAreaGroupAttachments() {
  const { state, actions } = useTextAreaGroup();

  if (!state.attachments || state.attachments.length === 0) {
    return null;
  }

  return (
    <AttachmentPreview.List>
      {state.attachments.map((attachment) => (
        <AttachmentPreview.Item
          attachment={attachment}
          key={attachment.id}
          onRemove={
            actions.onRemoveAttachment ??
            (() => {
              /* noop */
            })
          }
        />
      ))}
    </AttachmentPreview.List>
  );
}

const ACCEPTED_IMAGE_TYPES = "image/jpeg,image/png,image/gif,image/webp";

function TextAreaGroupAttachButton() {
  const { actions } = useTextAreaGroup();
  const inputRef = useRef<HTMLInputElement>(null);

  const handleClick = () => {
    inputRef.current?.click();
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const { files } = event.target;
    if (files && files.length > 0 && actions.onAddFiles) {
      actions.onAddFiles(files);
    }
    event.target.value = "";
  };

  return (
    <>
      <input
        accept={ACCEPTED_IMAGE_TYPES}
        className="hidden"
        multiple
        onChange={handleFileChange}
        ref={inputRef}
        type="file"
      />
      <IconButton onClick={handleClick} title="Attach images">
        <Paperclip size={14} />
      </IconButton>
    </>
  );
}

interface ToolbarProps {
  children: ReactNode;
}

function TextAreaGroupToolbar({ children }: ToolbarProps) {
  return (
    <div className="flex items-center gap-2 border-border border-t px-3 py-2">
      {children}
    </div>
  );
}

interface ModelSelectorProps {
  value: string;
  models: { label: string; value: string }[];
  onChange: (value: string) => void;
  disabled?: boolean;
}

function TextAreaGroupModelSelector({
  value,
  models,
  onChange,
  disabled,
}: ModelSelectorProps) {
  return (
    <div className="relative">
      <select
        className={cn(
          "appearance-none bg-transparent pr-1 text-xs focus:outline-none",
          disabled
            ? "cursor-default text-text-muted"
            : "cursor-pointer text-text-secondary"
        )}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        {models.map((model) => (
          <option
            className="bg-bg text-text"
            key={model.value}
            value={model.value}
          >
            {model.label}
          </option>
        ))}
      </select>
      <ChevronDown
        className="pointer-events-none absolute top-1/2 right-0 -translate-y-1/2 text-text-muted"
        size={12}
      />
    </div>
  );
}

function TextAreaGroupSubmit() {
  const { actions, meta } = useTextAreaGroup();

  if (meta.isSending) {
    return (
      <IconButton
        className="ml-auto"
        onClick={actions.onAbort}
        title="Stop generation"
      >
        <Square fill="currentColor" size={14} />
      </IconButton>
    );
  }

  return (
    <IconButton className="ml-auto" onClick={actions.onSubmit}>
      <Send size={14} />
    </IconButton>
  );
}

const TextAreaGroup = {
  Provider: TextAreaGroupProvider,
  Frame: TextAreaGroupFrame,
  Input: TextAreaGroupInput,
  Attachments: TextAreaGroupAttachments,
  AttachButton: TextAreaGroupAttachButton,
  Toolbar: TextAreaGroupToolbar,
  ModelSelector: TextAreaGroupModelSelector,
  Submit: TextAreaGroupSubmit,
};

export { TextAreaGroup };
