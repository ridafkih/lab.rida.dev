"use client";

import clsx from "clsx";
import { Box, ChevronRight, Loader2, Plus } from "lucide-react";
import {
  createContext,
  type HTMLProps,
  type ReactNode,
  use,
  useState,
} from "react";
import { tv } from "tailwind-variants";
import { IconButton } from "./icon-button";

const ProjectNavigatorContext = createContext<{
  expanded: boolean;
  toggle: () => void;
  setExpanded: (expanded: boolean) => void;
} | null>(null);

function useProjectNavigator() {
  const context = use(ProjectNavigatorContext);
  if (!context) {
    throw new Error(
      "ProjectNavigator components must be used within ProjectNavigator.List"
    );
  }
  return context;
}

interface ListProps {
  children: ReactNode;
  defaultExpanded?: boolean;
}

function ProjectNavigatorList({ children, defaultExpanded = true }: ListProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <ProjectNavigatorContext
      value={{
        expanded,
        toggle: () => setExpanded((isExpanded) => !isExpanded),
        setExpanded,
      }}
    >
      <div className="flex select-none flex-col gap-px bg-border">
        {children}
      </div>
    </ProjectNavigatorContext>
  );
}

const chevron = tv({
  base: "shrink-0 text-text-muted group-hover:text-text-secondary",
  variants: {
    expanded: {
      true: "rotate-90",
    },
  },
});

interface HeaderProps {
  children: ReactNode;
  onAdd?: () => void;
}

function ProjectNavigatorHeader({ children, onAdd }: HeaderProps) {
  const { expanded, toggle, setExpanded } = useProjectNavigator();

  return (
    <button
      className="group flex w-full items-center gap-2 bg-bg-muted px-3 py-1.5 text-left"
      onClick={toggle}
      type="button"
    >
      <ChevronRight className={chevron({ expanded })} size={14} />
      <Box className="shrink-0 text-text-secondary" size={14} />
      {children}
      <IconButton
        as="span"
        className="ml-auto"
        onClick={(event) => {
          event.stopPropagation();
          setExpanded(true);
          onAdd?.();
        }}
      >
        <Plus size={14} />
      </IconButton>
    </button>
  );
}

function ProjectNavigatorHeaderName({ children }: { children: ReactNode }) {
  return <span className="truncate">{children}</span>;
}

function ProjectNavigatorHeaderCount({ children }: { children: ReactNode }) {
  return <span className="text-text-muted">{children}</span>;
}

function ProjectNavigatorHeaderSkeleton() {
  return (
    <div className="flex select-none flex-col gap-px bg-border">
      <div className="flex items-center gap-2 bg-bg-muted px-3 py-1.5">
        <ChevronRight className="shrink-0 text-text-muted" size={14} />
        <Loader2 className="shrink-0 animate-spin text-text-muted" size={14} />
        <span className="text-text-muted">Loading...</span>
      </div>
    </div>
  );
}

const listItem = tv({
  base: "flex cursor-pointer items-center gap-2 bg-bg px-3 py-1.5",
  variants: {
    selected: {
      true: "bg-bg-hover",
      false: "hover:bg-bg-hover",
    },
  },
  defaultVariants: {
    selected: false,
  },
});

interface ItemProps {
  children: ReactNode;
  selected?: boolean;
  onClick?: () => void;
  onMouseDown?: () => void;
}

function ProjectNavigatorItem({
  children,
  selected,
  onClick,
  onMouseDown,
}: ItemProps) {
  const { expanded } = useProjectNavigator();

  if (!expanded) {
    return null;
  }

  return (
    <button
      className={listItem({ selected, className: "w-full text-left" })}
      onClick={onClick}
      onMouseDown={onMouseDown}
      type="button"
    >
      {children}
    </button>
  );
}

function ProjectNavigatorItemSkeleton({ children }: { children?: ReactNode }) {
  const { expanded } = useProjectNavigator();

  if (!expanded) {
    return null;
  }

  return (
    <div className={listItem({ selected: false })}>
      <Loader2 className="shrink-0 animate-spin text-text-muted" size={14} />
      {children}
    </div>
  );
}

function ProjectNavigatorItemSkeletonBlock() {
  return (
    <div className="h-3 w-full max-w-10 animate-pulse rounded bg-bg-hover" />
  );
}

function ProjectNavigatorItemTitle({
  children,
  empty = false,
}: {
  children: ReactNode;
  empty?: boolean;
}) {
  if (empty) {
    return (
      <span className="block overflow-hidden truncate text-text-muted italic">
        Unnamed Session
      </span>
    );
  }

  return (
    <span className="block overflow-hidden truncate text-text">{children}</span>
  );
}

function ProjectNavigatorItemDescription({
  children,
  className,
  ...props
}: { children?: ReactNode } & HTMLProps<HTMLSpanElement>) {
  return (
    <span
      {...props}
      className={clsx("truncate text-right text-text-muted", className)}
    >
      {children}
    </span>
  );
}

const ProjectNavigator = {
  List: ProjectNavigatorList,
  Header: ProjectNavigatorHeader,
  HeaderName: ProjectNavigatorHeaderName,
  HeaderCount: ProjectNavigatorHeaderCount,
  HeaderSkeleton: ProjectNavigatorHeaderSkeleton,
  Item: ProjectNavigatorItem,
  ItemTitle: ProjectNavigatorItemTitle,
  ItemDescription: ProjectNavigatorItemDescription,
  ItemSkeleton: ProjectNavigatorItemSkeleton,
  ItemSkeletonBlock: ProjectNavigatorItemSkeletonBlock,
};

export { ProjectNavigator };
