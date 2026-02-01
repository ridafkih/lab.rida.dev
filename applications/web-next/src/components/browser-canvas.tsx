"use client";

import {
  useEffect,
  useState,
  useRef,
  useCallback,
  createContext,
  use,
  type ReactNode,
} from "react";
import { useMultiplayer } from "@/lib/multiplayer";
import { useMultiplayerEnabled } from "@/app/providers";
import { cn } from "@/lib/cn";

type BrowserCurrentState = "pending" | "stopped" | "starting" | "running" | "stopping" | "error";

interface BrowserStreamState {
  bitmap: ImageBitmap | null;
  currentState: BrowserCurrentState;
  errorMessage?: string;
}

const BrowserStreamContext = createContext<BrowserStreamState | null>(null);

function useBrowserStream() {
  const context = use(BrowserStreamContext);
  if (!context) {
    throw new Error("useBrowserStream must be used within BrowserCanvas.Root");
  }
  return context;
}

interface RootProps {
  sessionId: string;
  children: ReactNode;
}

function BrowserCanvasRoot({ sessionId, children }: RootProps) {
  const isEnabled = useMultiplayerEnabled();
  const [bitmap, setBitmap] = useState<ImageBitmap | null>(null);
  const bitmapRef = useRef<ImageBitmap | null>(null);
  const { useChannel, useChannelEvent } = useMultiplayer();

  const browserState = useChannel("sessionBrowserState", { uuid: sessionId });
  const frameSnapshot = useChannel("sessionBrowserFrames", { uuid: sessionId });

  useEffect(() => {
    setBitmap((prev) => {
      prev?.close();
      bitmapRef.current = null;
      return null;
    });
  }, [sessionId]);

  const processFrame = useCallback((base64: string) => {
    fetch(`data:image/jpeg;base64,${base64}`)
      .then((res) => res.blob())
      .then((blob) => createImageBitmap(blob))
      .then((newBitmap) => {
        setBitmap((prev) => {
          prev?.close();
          bitmapRef.current = newBitmap;
          return newBitmap;
        });
      })
      .catch((error) => {
        console.error("Failed to process frame:", error);
      });
  }, []);

  useEffect(() => {
    if (isEnabled && frameSnapshot.lastFrame) {
      processFrame(frameSnapshot.lastFrame);
    }
  }, [isEnabled, frameSnapshot.lastFrame, processFrame]);

  const handleFrameEvent = useCallback(
    (event: { type: "frame"; data: string; timestamp: number }) => {
      processFrame(event.data);
    },
    [processFrame],
  );

  useChannelEvent("sessionBrowserFrames", handleFrameEvent, { uuid: sessionId });

  useEffect(() => {
    return () => {
      bitmapRef.current?.close();
    };
  }, []);

  return (
    <BrowserStreamContext
      value={{
        bitmap: isEnabled ? bitmap : null,
        currentState: browserState.currentState,
        errorMessage: browserState.errorMessage ?? undefined,
      }}
    >
      {children}
    </BrowserStreamContext>
  );
}

function BrowserCanvasPlaceholder({ children }: { children?: ReactNode }) {
  const { bitmap } = useBrowserStream();

  if (bitmap) return null;

  if (children) return children;

  return (
    <div
      className="aspect-video flex items-center justify-center"
      style={{
        background:
          "repeating-linear-gradient(-45deg, var(--color-bg-muted), var(--color-bg-muted) 4px, var(--color-bg) 4px, var(--color-bg) 8px)",
      }}
    >
      <div className="size-4 border-2 border-text-muted border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

function BrowserCanvasView({ className }: { className?: string }) {
  const { bitmap } = useBrowserStream();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !bitmap) return;

    const context = canvas.getContext("2d");
    if (!context) return;

    if (canvas.width !== bitmap.width || canvas.height !== bitmap.height) {
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
    }
    context.drawImage(bitmap, 0, 0);
  }, [bitmap]);

  return (
    <div
      className={cn("relative overflow-hidden", className ?? "aspect-video bg-black")}
      style={{ display: bitmap ? undefined : "none" }}
    >
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full object-contain" />
    </div>
  );
}

export const BrowserCanvas = {
  Root: BrowserCanvasRoot,
  Placeholder: BrowserCanvasPlaceholder,
  View: BrowserCanvasView,
};

export { useBrowserStream };
