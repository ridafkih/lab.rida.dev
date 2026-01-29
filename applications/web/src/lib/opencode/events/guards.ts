import type {
  Event,
  EventSessionCreated,
  EventSessionUpdated,
  EventSessionDeleted,
  EventSessionStatus,
  EventSessionIdle,
  EventSessionError,
  EventMessageUpdated,
  EventMessageRemoved,
  EventMessagePartUpdated,
  EventMessagePartRemoved,
  EventPermissionUpdated,
  EventPermissionReplied,
  Part,
  TextPart,
  ReasoningPart,
  ToolPart,
  FilePart,
  StepStartPart,
  StepFinishPart,
} from "@opencode-ai/sdk/client";

export function isSessionCreatedEvent(event: Event): event is EventSessionCreated {
  return event.type === "session.created";
}

export function isSessionUpdatedEvent(event: Event): event is EventSessionUpdated {
  return event.type === "session.updated";
}

export function isSessionDeletedEvent(event: Event): event is EventSessionDeleted {
  return event.type === "session.deleted";
}

export function isSessionStatusEvent(event: Event): event is EventSessionStatus {
  return event.type === "session.status";
}

export function isSessionIdleEvent(event: Event): event is EventSessionIdle {
  return event.type === "session.idle";
}

export function isSessionErrorEvent(event: Event): event is EventSessionError {
  return event.type === "session.error";
}

export function isMessageUpdatedEvent(event: Event): event is EventMessageUpdated {
  return event.type === "message.updated";
}

export function isMessageRemovedEvent(event: Event): event is EventMessageRemoved {
  return event.type === "message.removed";
}

export function isMessagePartUpdatedEvent(event: Event): event is EventMessagePartUpdated {
  return event.type === "message.part.updated";
}

export function isMessagePartRemovedEvent(event: Event): event is EventMessagePartRemoved {
  return event.type === "message.part.removed";
}

export function isPermissionUpdatedEvent(event: Event): event is EventPermissionUpdated {
  return event.type === "permission.updated";
}

export function isPermissionRepliedEvent(event: Event): event is EventPermissionReplied {
  return event.type === "permission.replied";
}

export function isTextPart(part: Part): part is TextPart {
  return part.type === "text";
}

export function isReasoningPart(part: Part): part is ReasoningPart {
  return part.type === "reasoning";
}

export function isToolPart(part: Part): part is ToolPart {
  return part.type === "tool";
}

export function isFilePart(part: Part): part is FilePart {
  return part.type === "file";
}

export function isStepStartPart(part: Part): part is StepStartPart {
  return part.type === "step-start";
}

export function isStepFinishPart(part: Part): part is StepFinishPart {
  return part.type === "step-finish";
}
