"use client";

import { Copy } from "@lab/ui/components/copy";
import { PlayCircle, CheckCircle } from "lucide-react";
import type { StepStartPart, StepFinishPart } from "@opencode-ai/sdk/client";

interface StepStartBoundaryProps {
  part: StepStartPart;
}

interface StepFinishBoundaryProps {
  part: StepFinishPart;
}

function formatTokens(tokens: StepFinishPart["tokens"]): string {
  const parts: string[] = [];

  if (tokens.input > 0) {
    parts.push(`${tokens.input.toLocaleString()} in`);
  }
  if (tokens.output > 0) {
    parts.push(`${tokens.output.toLocaleString()} out`);
  }
  if (tokens.reasoning > 0) {
    parts.push(`${tokens.reasoning.toLocaleString()} reasoning`);
  }

  return parts.join(" / ");
}

function formatCost(cost: number): string {
  if (cost < 0.01) {
    return `$${cost.toFixed(4)}`;
  }
  return `$${cost.toFixed(2)}`;
}

export function StepStartBoundary({ part: _part }: StepStartBoundaryProps) {
  return (
    <div className="flex items-center gap-2 px-4 py-1 border-b border-border bg-muted/20">
      <PlayCircle className="size-3 text-blue-500" />
      <Copy as="span" size="xs" muted>
        Step started
      </Copy>
    </div>
  );
}

export function StepFinishBoundary({ part }: StepFinishBoundaryProps) {
  const tokenInfo = formatTokens(part.tokens);
  const costInfo = formatCost(part.cost);

  return (
    <div className="flex items-center gap-2 px-4 py-1 border-b border-border bg-muted/20">
      <CheckCircle className="size-3 text-green-500" />
      <Copy as="span" size="xs" muted>
        Step finished
      </Copy>
      <span className="flex-1" />
      {tokenInfo && (
        <Copy as="span" size="xs" muted>
          {tokenInfo}
        </Copy>
      )}
      <Copy as="span" size="xs" muted>
        {costInfo}
      </Copy>
    </div>
  );
}
