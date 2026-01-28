"use client";

import {
  createContext,
  useContext,
  useState,
  useRef,
  useCallback,
  type ReactNode,
  type MouseEvent,
} from "react";
import { cn } from "../utils/cn";

type Direction = "horizontal" | "vertical";

type ResizableContextValue = {
  direction: Direction;
  registerPanel: (id: string, initialSize: number, minSize?: number, maxSize?: number) => void;
  sizes: Map<string, number>;
  startResize: (handleIndex: number, e: MouseEvent) => void;
};

const ResizableContext = createContext<ResizableContextValue | null>(null);

function useResizable() {
  const context = useContext(ResizableContext);
  if (!context) throw new Error("Resizable components must be used within ResizableGroup");
  return context;
}

export type ResizableGroupProps = {
  direction?: Direction;
  children: ReactNode;
  className?: string;
};

export function ResizableGroup({ direction = "horizontal", children, className }: ResizableGroupProps) {
  const [sizes, setSizes] = useState<Map<string, number>>(new Map());
  const panelsRef = useRef<{ id: string; minSize: number; maxSize: number }[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const resizingRef = useRef<{ handleIndex: number; startPos: number; startSizes: number[] } | null>(null);

  const registerPanel = useCallback((id: string, initialSize: number, minSize = 0, maxSize = Infinity) => {
    setSizes((prev) => {
      const next = new Map(prev);
      if (!next.has(id)) {
        next.set(id, initialSize);
        panelsRef.current.push({ id, minSize, maxSize });
      }
      return next;
    });
  }, []);

  const startResize = useCallback((handleIndex: number, e: MouseEvent) => {
    e.preventDefault();
    const panelIds = panelsRef.current.map((p) => p.id);
    const startSizes = panelIds.map((id) => sizes.get(id) ?? 0);
    const startPos = direction === "horizontal" ? e.clientX : e.clientY;

    resizingRef.current = { handleIndex, startPos, startSizes };

    const handleMouseMove = (moveEvent: globalThis.MouseEvent) => {
      if (!resizingRef.current || !containerRef.current) return;

      const currentPos = direction === "horizontal" ? moveEvent.clientX : moveEvent.clientY;
      const delta = currentPos - resizingRef.current.startPos;

      const { handleIndex, startSizes } = resizingRef.current;
      const leftPanel = panelsRef.current[handleIndex];
      const rightPanel = panelsRef.current[handleIndex + 1];

      if (!leftPanel || !rightPanel) return;

      let newLeftSize = startSizes[handleIndex] + delta;
      let newRightSize = startSizes[handleIndex + 1] - delta;

      newLeftSize = Math.max(leftPanel.minSize, Math.min(leftPanel.maxSize, newLeftSize));
      newRightSize = Math.max(rightPanel.minSize, Math.min(rightPanel.maxSize, newRightSize));

      const totalSize = startSizes[handleIndex] + startSizes[handleIndex + 1];
      if (newLeftSize + newRightSize !== totalSize) {
        if (delta > 0) {
          newLeftSize = totalSize - newRightSize;
        } else {
          newRightSize = totalSize - newLeftSize;
        }
      }

      setSizes((prev) => {
        const next = new Map(prev);
        next.set(leftPanel.id, newLeftSize);
        next.set(rightPanel.id, newRightSize);
        return next;
      });
    };

    const handleMouseUp = () => {
      resizingRef.current = null;
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    document.body.style.cursor = direction === "horizontal" ? "col-resize" : "row-resize";
    document.body.style.userSelect = "none";
  }, [direction, sizes]);

  return (
    <ResizableContext.Provider value={{ direction, registerPanel, sizes, startResize }}>
      <div
        ref={containerRef}
        className={cn("flex", direction === "vertical" && "flex-col", className)}
      >
        {children}
      </div>
    </ResizableContext.Provider>
  );
}

export type ResizablePanelProps = {
  id: string;
  defaultSize: number;
  minSize?: number;
  maxSize?: number;
  children: ReactNode;
  className?: string;
};

export function ResizablePanel({
  id,
  defaultSize,
  minSize = 0,
  maxSize = Infinity,
  children,
  className,
}: ResizablePanelProps) {
  const { direction, registerPanel, sizes } = useResizable();
  const hasRegistered = useRef(false);

  if (!hasRegistered.current) {
    registerPanel(id, defaultSize, minSize, maxSize);
    hasRegistered.current = true;
  }

  const size = sizes.get(id) ?? defaultSize;
  const style = direction === "horizontal" ? { width: size } : { height: size };

  return (
    <div className={cn("flex-shrink-0 overflow-hidden", className)} style={style}>
      {children}
    </div>
  );
}

export type ResizableHandleProps = {
  index: number;
  className?: string;
};

export function ResizableHandle({ index, className }: ResizableHandleProps) {
  const { direction, startResize } = useResizable();
  const isHorizontal = direction === "horizontal";

  return (
    <div
      className={cn(
        "flex-shrink-0 bg-border hover:bg-accent group",
        isHorizontal ? "w-px cursor-col-resize" : "h-px cursor-row-resize",
        className
      )}
      onMouseDown={(e) => startResize(index, e)}
    >
      <div
        className={cn(
          "opacity-0 group-hover:opacity-100 bg-accent",
          isHorizontal ? "w-1 h-full -ml-0.5" : "h-1 w-full -mt-0.5"
        )}
      />
    </div>
  );
}
