import type { Type } from "arktype";
import type { MaybePromise } from "bun";

type MaybeCleanupFunction = (() => void) | undefined;

interface WithSetup<EnvType extends Type, SetupResult> {
  name: string;
  env?: EnvType;
  setup: (options: { env: EnvType["inferOut"] }) => MaybePromise<SetupResult>;
  main: (options: {
    env: EnvType["inferOut"];
    extras: Awaited<SetupResult>;
  }) => MaybePromise<MaybeCleanupFunction>;
}

interface WithoutSetup<EnvType extends Type> {
  name: string;
  env?: EnvType;
  main: (options: {
    env: EnvType["inferOut"];
  }) => MaybePromise<MaybeCleanupFunction>;
}

async function entry<EnvType extends Type, SetupResult>(
  options: WithSetup<EnvType, SetupResult>
): Promise<MaybeCleanupFunction>;
async function entry<EnvType extends Type>(
  options: WithoutSetup<EnvType>
): Promise<MaybeCleanupFunction>;
async function entry<EnvType extends Type>(
  options: WithSetup<EnvType, unknown> | WithoutSetup<EnvType>
): Promise<MaybeCleanupFunction> {
  const env = options.env?.assert(process.env);

  const cleanup =
    "setup" in options
      ? await options.main({ env, extras: await options.setup({ env }) })
      : await options.main({ env });

  if (!cleanup) {
    return;
  }

  process.once("SIGTERM", cleanup);
  process.once("SIGINT", cleanup);
}

export { entry };

// biome-ignore lint/performance/noBarrelFile: This is valid as to prevent the need for a peer dependency
export { type } from "arktype";
