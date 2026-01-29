"use client";

import { Copy } from "@lab/ui/components/copy";
import type { StepFinishPart } from "@opencode-ai/sdk/client";

interface OpencodePartStepFinishProps {
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

export function OpencodePartStepFinish({ part }: OpencodePartStepFinishProps) {
  const tokenInfo = formatTokens(part.tokens);
  const costInfo = formatCost(part.cost);

  return (
    <div className="flex items-center justify-end gap-2 px-4 py-1 border-b last:border-b-0 border-border bg-muted/20">
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
