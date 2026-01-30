import { z } from "zod";

export const BrowserErrorKind = z.enum([
  "DaemonNotFound",
  "DaemonStartFailed",
  "DaemonStopFailed",
  "ConnectionFailed",
  "NavigationFailed",
  "StateTransitionInvalid",
  "SessionNotFound",
  "ValidationFailed",
  "Timeout",
]);

export type BrowserErrorKind = z.infer<typeof BrowserErrorKind>;

export class BrowserError extends Error {
  constructor(
    public readonly kind: BrowserErrorKind,
    message: string,
    public readonly sessionId?: string,
  ) {
    super(message);
    this.name = "BrowserError";
  }
}

export const daemonNotFound = (sessionId: string) =>
  new BrowserError("DaemonNotFound", `Daemon not found for session ${sessionId}`, sessionId);

export const daemonStartFailed = (sessionId: string, reason: string) =>
  new BrowserError("DaemonStartFailed", reason, sessionId);

export const daemonStopFailed = (sessionId: string, reason: string) =>
  new BrowserError("DaemonStopFailed", reason, sessionId);

export const connectionFailed = (sessionId: string, reason: string) =>
  new BrowserError("ConnectionFailed", reason, sessionId);

export const navigationFailed = (sessionId: string, url: string, reason: string) =>
  new BrowserError("NavigationFailed", `Failed to navigate to ${url}: ${reason}`, sessionId);

export const stateTransitionInvalid = (sessionId: string, from: string, to: string) =>
  new BrowserError("StateTransitionInvalid", `Invalid transition from ${from} to ${to}`, sessionId);

export const sessionNotFound = (sessionId: string) =>
  new BrowserError("SessionNotFound", `Session ${sessionId} not found`, sessionId);

export const validationFailed = (message: string, sessionId?: string) =>
  new BrowserError("ValidationFailed", message, sessionId);

export const timeout = (sessionId: string, operation: string) =>
  new BrowserError("Timeout", `${operation} timed out`, sessionId);
