"use client";

import { createContext, use, type ReactNode, type RefObject } from "react";
import { Send, ChevronDown } from "lucide-react";
import { IconButton } from "./icon-button";

type TextAreaGroupState = {
  value: string;
};

type TextAreaGroupActions = {
  onChange: (value: string) => void;
  onSubmit: () => void;
};

type TextAreaGroupMeta = {
  textareaRef?: RefObject<HTMLTextAreaElement | null>;
};

type TextAreaGroupContextValue = {
  state: TextAreaGroupState;
  actions: TextAreaGroupActions;
  meta: TextAreaGroupMeta;
};

const TextAreaGroupContext = createContext<TextAreaGroupContextValue | null>(null);

function useTextAreaGroup() {
  const context = use(TextAreaGroupContext);
  if (!context) {
    throw new Error("TextAreaGroup components must be used within TextAreaGroup.Provider");
  }
  return context;
}

type ProviderProps = {
  children: ReactNode;
  state: TextAreaGroupState;
  actions: TextAreaGroupActions;
  meta?: TextAreaGroupMeta;
};

function TextAreaGroupProvider({ children, state, actions, meta = {} }: ProviderProps) {
  return <TextAreaGroupContext value={{ state, actions, meta }}>{children}</TextAreaGroupContext>;
}

type FrameProps = {
  children: ReactNode;
};

function TextAreaGroupFrame({ children }: FrameProps) {
  return (
    <div className="flex flex-col bg-bg-muted border border-border overflow-hidden pointer-events-auto">
      {children}
    </div>
  );
}

type InputProps = {
  placeholder?: string;
  rows?: number;
};

function TextAreaGroupInput({
  placeholder = "Describe a task to provide context to the orchestrator...",
  rows = 3,
}: InputProps) {
  const { state, actions, meta } = useTextAreaGroup();

  return (
    <textarea
      ref={meta.textareaRef}
      value={state.value}
      onChange={(event) => actions.onChange(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter" && !event.shiftKey) {
          event.preventDefault();
          actions.onSubmit();
        }
      }}
      placeholder={placeholder}
      rows={rows}
      className="w-full resize-none bg-transparent p-3 text-sm placeholder:text-text-muted focus:outline-none"
    />
  );
}

type ToolbarProps = {
  children: ReactNode;
};

function TextAreaGroupToolbar({ children }: ToolbarProps) {
  return <div className="flex items-center gap-2 px-3 py-2 border-t border-border">{children}</div>;
}

type ModelSelectorProps = {
  value: string;
  options: { label: string; value: string }[];
  onChange: (value: string) => void;
};

function TextAreaGroupModelSelector({ value, options, onChange }: ModelSelectorProps) {
  const selectedOption = options.find((option) => option.value === value);

  return (
    <div className="relative">
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="appearance-none bg-transparent text-xs text-text-secondary pr-5 cursor-pointer focus:outline-none"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown
        size={12}
        className="absolute right-0 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none"
      />
    </div>
  );
}

function TextAreaGroupSubmit() {
  const { actions } = useTextAreaGroup();

  return (
    <IconButton onClick={actions.onSubmit} className="ml-auto">
      <Send size={14} />
    </IconButton>
  );
}

const TextAreaGroup = {
  Provider: TextAreaGroupProvider,
  Frame: TextAreaGroupFrame,
  Input: TextAreaGroupInput,
  Toolbar: TextAreaGroupToolbar,
  ModelSelector: TextAreaGroupModelSelector,
  Submit: TextAreaGroupSubmit,
};

export { TextAreaGroup, useTextAreaGroup };
