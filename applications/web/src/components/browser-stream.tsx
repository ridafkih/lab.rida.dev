"use client";

import { useEffect, useRef, useState } from "react";
import { Copy } from "@lab/ui/components/copy";
import { cn } from "@lab/ui/utils/cn";
import { Loader2, AlertCircle } from "lucide-react";

type BrowserStreamState = {
  desiredState: "running" | "stopped";
  actualState: "pending" | "starting" | "running" | "stopping" | "stopped" | "error";
  streamPort?: number;
  errorMessage?: string;
};

type BrowserStreamProps = {
  sessionId: string;
  wsBaseUrl: string;
  className?: string;
  browserStreamState?: BrowserStreamState;
};

type BrowserStatus = {
  connected: boolean;
  screencasting: boolean;
  browserLaunched: boolean;
};

const defaultBrowserStreamState: BrowserStreamState = {
  desiredState: "stopped",
  actualState: "stopped",
};

export function BrowserStream({
  sessionId,
  wsBaseUrl,
  className,
  browserStreamState = defaultBrowserStreamState,
}: BrowserStreamProps) {
  const [frame, setFrame] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<
    "waiting" | "connecting" | "connected" | "disconnected"
  >("waiting");
  const [browserStatus, setBrowserStatus] = useState<BrowserStatus>({
    connected: false,
    screencasting: false,
    browserLaunched: true,
  });
  const wsRef = useRef<WebSocket | null>(null);
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  const { actualState, errorMessage } = browserStreamState;
  const isReady = actualState === "running";

  useEffect(() => {
    // Clear any pending retry
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }

    // Close any existing connection when not ready
    if (!isReady) {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      setConnectionStatus("waiting");
      setFrame(null);
      setRetryCount(0);
      return;
    }

    setConnectionStatus("connecting");

    const baseUrl = wsBaseUrl.replace(/\/ws\/?$/, "");
    const ws = new WebSocket(`${baseUrl}/ws/browser?sessionId=${sessionId}`);
    wsRef.current = ws;

    ws.onopen = () => setConnectionStatus("connected");
    ws.onerror = () => setConnectionStatus("disconnected");

    ws.onclose = () => {
      setConnectionStatus("disconnected");
      wsRef.current = null;
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === "frame") {
        setFrame(`data:image/jpeg;base64,${data.data}`);
        setRetryCount(0); // Reset retry count on successful frame
        setBrowserStatus((prev) => ({
          ...prev,
          browserLaunched: true,
          screencasting: true,
        }));
      } else if (data.type === "status") {
        setBrowserStatus((prev) => ({
          connected: data.connected ?? false,
          screencasting: data.screencasting ?? false,
          browserLaunched: data.screencasting ? true : prev.browserLaunched,
        }));
      } else if (data.type === "error" && data.message === "Browser not launched") {
        setBrowserStatus((prev) => ({
          ...prev,
          browserLaunched: false,
          screencasting: false,
        }));
        // Browser not ready yet - schedule retry
        ws.close();
        retryTimeoutRef.current = setTimeout(() => {
          setRetryCount((c) => c + 1);
        }, 2000);
      }
    };

    return () => {
      ws.close();
      wsRef.current = null;
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = null;
      }
    };
  }, [sessionId, wsBaseUrl, isReady, retryCount]);

  if (actualState === "stopped") {
    return (
      <div className={cn("aspect-video bg-muted flex items-center justify-center", className)}>
        <Copy size="xs" muted>
          Browser stopped
        </Copy>
      </div>
    );
  }

  if (actualState === "pending" || actualState === "starting") {
    return (
      <div
        className={cn(
          "aspect-video bg-muted flex flex-col items-center justify-center gap-2",
          className,
        )}
      >
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
        <Copy size="xs" muted>
          {actualState === "pending" ? "Preparing browser..." : "Starting browser..."}
        </Copy>
      </div>
    );
  }

  if (actualState === "stopping") {
    return (
      <div
        className={cn(
          "aspect-video bg-muted flex flex-col items-center justify-center gap-2",
          className,
        )}
      >
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
        <Copy size="xs" muted>
          Stopping browser...
        </Copy>
      </div>
    );
  }

  if (actualState === "error") {
    return (
      <div
        className={cn(
          "aspect-video bg-muted flex flex-col items-center justify-center gap-2",
          className,
        )}
      >
        <AlertCircle className="size-5 text-destructive" />
        <Copy size="xs" muted>
          {errorMessage ?? "Browser error"}
        </Copy>
      </div>
    );
  }

  if (connectionStatus === "connecting") {
    return (
      <div className={cn("aspect-video bg-muted flex items-center justify-center", className)}>
        <Copy size="xs" muted>
          Connecting...
        </Copy>
      </div>
    );
  }

  if (connectionStatus === "disconnected") {
    return (
      <div className={cn("aspect-video bg-muted flex items-center justify-center", className)}>
        <Copy size="xs" muted>
          Disconnected
        </Copy>
      </div>
    );
  }

  if (!browserStatus.browserLaunched) {
    return (
      <div className={cn("aspect-video bg-muted flex items-center justify-center", className)}>
        <Copy size="xs" muted>
          Browser idle
        </Copy>
      </div>
    );
  }

  if (!frame) {
    return (
      <div className={cn("aspect-video bg-muted flex items-center justify-center", className)}>
        <Copy size="xs" muted>
          {browserStatus.screencasting
            ? "Connected — waiting for browser activity"
            : "Waiting for frames..."}
        </Copy>
      </div>
    );
  }

  return (
    <div className={cn("aspect-video bg-muted", className)}>
      <img src={frame} alt="Browser viewport" className="w-full h-full object-contain" />
    </div>
  );
}
