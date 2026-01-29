"use client";

import { useCallback } from "react";
import { Button } from "@lab/ui/components/button";
import { Copy } from "@lab/ui/components/copy";
import { ShieldAlert, X, Check, CheckCheck } from "lucide-react";
import type { PermissionRequest, PermissionResponse } from "@/lib/opencode/state/types";

interface PermissionDialogProps {
  permission: PermissionRequest;
  onRespond: (permissionId: string, response: PermissionResponse) => void;
}

export function PermissionDialog({ permission, onRespond }: PermissionDialogProps) {
  const { permission: perm } = permission;

  const handleDeny = useCallback(() => {
    onRespond(perm.id, "reject");
  }, [onRespond, perm.id]);

  const handleAllowOnce = useCallback(() => {
    onRespond(perm.id, "once");
  }, [onRespond, perm.id]);

  const handleAllowAlways = useCallback(() => {
    onRespond(perm.id, "always");
  }, [onRespond, perm.id]);

  const patterns = Array.isArray(perm.pattern) ? perm.pattern : perm.pattern ? [perm.pattern] : [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-lg border border-border bg-background p-6 shadow-lg">
        <div className="flex items-center gap-3 mb-4">
          <ShieldAlert className="size-5 text-amber-500" />
          <span className="font-medium">Permission Required</span>
        </div>

        <Copy as="p" size="sm" className="mb-4">
          {perm.title}
        </Copy>

        {patterns.length > 0 && (
          <div className="mb-4 rounded border border-border bg-muted p-3">
            <Copy as="p" size="xs" muted className="mb-2">
              Patterns:
            </Copy>
            <div className="flex flex-col gap-1">
              {patterns.map((pattern, index) => (
                <code key={index} className="text-xs font-mono text-foreground">
                  {pattern}
                </code>
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-2 justify-end">
          <Button variant="secondary" icon={<X className="size-3" />} onClick={handleDeny}>
            Deny
          </Button>
          <Button variant="secondary" icon={<Check className="size-3" />} onClick={handleAllowOnce}>
            Allow Once
          </Button>
          <Button
            variant="primary"
            icon={<CheckCheck className="size-3" />}
            onClick={handleAllowAlways}
          >
            Allow Always
          </Button>
        </div>
      </div>
    </div>
  );
}
