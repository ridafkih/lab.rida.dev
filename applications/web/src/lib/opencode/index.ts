export { OpenCodeEventsProvider, useOpenCodeEvents } from "./events/provider";
export { useAgent } from "./hooks/use-agent";
export { useOpenCodeState } from "./hooks/use-opencode-state";
export { usePermissions } from "./hooks/use-permissions";

export type {
  UIState,
  SessionState,
  MessageState,
  PartState,
  PermissionRequest,
  PermissionResponse,
  ConnectionStatus,
} from "./state/types";

export {
  isTextPart,
  isReasoningPart,
  isToolPart,
  isFilePart,
  isStepStartPart,
  isStepFinishPart,
  isSessionCreatedEvent,
  isSessionUpdatedEvent,
  isSessionDeletedEvent,
  isSessionStatusEvent,
  isSessionIdleEvent,
  isSessionErrorEvent,
  isMessageUpdatedEvent,
  isMessageRemovedEvent,
  isMessagePartUpdatedEvent,
  isMessagePartRemovedEvent,
  isPermissionUpdatedEvent,
  isPermissionRepliedEvent,
} from "./events/guards";
