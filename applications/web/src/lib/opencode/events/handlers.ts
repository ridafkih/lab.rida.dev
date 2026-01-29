import type { Event } from "@opencode-ai/sdk/client";
import type { OpenCodeAction } from "../state/actions";
import {
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
} from "./guards";
import { extractErrorMessage } from "./utils";

export function createActionsFromEvent(event: Event): OpenCodeAction[] {
  if (isSessionCreatedEvent(event)) {
    return [{ type: "SESSION_CREATED", payload: { session: event.properties.info } }];
  }

  if (isSessionUpdatedEvent(event)) {
    return [{ type: "SESSION_UPDATED", payload: { session: event.properties.info } }];
  }

  if (isSessionDeletedEvent(event)) {
    return [{ type: "SESSION_DELETED", payload: { sessionId: event.properties.info.id } }];
  }

  if (isSessionStatusEvent(event)) {
    return [
      {
        type: "SESSION_STATUS_CHANGED",
        payload: {
          sessionId: event.properties.sessionID,
          status: event.properties.status,
        },
      },
    ];
  }

  if (isSessionIdleEvent(event)) {
    return [{ type: "SESSION_IDLE", payload: { sessionId: event.properties.sessionID } }];
  }

  if (isSessionErrorEvent(event)) {
    const errorMessage = extractErrorMessage(event.properties.error);
    return [{ type: "ERROR_SET", payload: { error: new Error(errorMessage) } }];
  }

  if (isMessageUpdatedEvent(event)) {
    return [{ type: "MESSAGE_UPDATED", payload: { message: event.properties.info } }];
  }

  if (isMessageRemovedEvent(event)) {
    return [
      {
        type: "MESSAGE_REMOVED",
        payload: {
          sessionId: event.properties.sessionID,
          messageId: event.properties.messageID,
        },
      },
    ];
  }

  if (isMessagePartUpdatedEvent(event)) {
    return [
      {
        type: "PART_UPDATED",
        payload: {
          part: event.properties.part,
          delta: event.properties.delta,
        },
      },
    ];
  }

  if (isMessagePartRemovedEvent(event)) {
    return [
      {
        type: "PART_REMOVED",
        payload: {
          sessionId: event.properties.sessionID,
          messageId: event.properties.messageID,
          partId: event.properties.partID,
        },
      },
    ];
  }

  if (isPermissionUpdatedEvent(event)) {
    return [{ type: "PERMISSION_REQUESTED", payload: { permission: event.properties } }];
  }

  if (isPermissionRepliedEvent(event)) {
    return [
      {
        type: "PERMISSION_REPLIED",
        payload: {
          sessionId: event.properties.sessionID,
          permissionId: event.properties.permissionID,
        },
      },
    ];
  }

  return [];
}
