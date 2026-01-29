"use client";

import { useCallback, useMemo } from "react";
import type { OpencodeClient } from "@opencode-ai/sdk/client";
import type { PermissionRequest, PermissionResponse } from "../state/types";

interface UsePermissionsOptions {
  client: OpencodeClient;
  sessionId: string;
  pendingPermissions: PermissionRequest[];
}

interface UsePermissionsResult {
  activePermission: PermissionRequest | null;
  respondToPermission: (permissionId: string, response: PermissionResponse) => Promise<void>;
}

export function usePermissions({
  client,
  sessionId,
  pendingPermissions,
}: UsePermissionsOptions): UsePermissionsResult {
  const activePermission = useMemo(() => {
    return pendingPermissions.find((pendingPermission) => pendingPermission.sessionId === sessionId) ?? null;
  }, [pendingPermissions, sessionId]);

  const respondToPermission = useCallback(
    async (permissionId: string, response: PermissionResponse) => {
      await client.postSessionIdPermissionsPermissionId({
        path: { id: sessionId, permissionID: permissionId },
        body: { response },
      });
    },
    [client, sessionId],
  );

  return {
    activePermission,
    respondToPermission,
  };
}
