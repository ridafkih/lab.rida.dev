import type {
  ContainerCreateOptions,
  ContainerInfo,
  ContainerManager,
  ExitResult,
  LogChunk,
} from "@lab/sandbox-sdk";
import type Dockerode from "dockerode";
import { toContainerState } from "../utils/container-state";
import { isNotFoundError, isNotRunningError } from "../utils/error-handling";

const DOCKER_LOG_HEADER_SIZE = 8;
const DOCKER_LOG_SIZE_OFFSET = 4;
const STDOUT_STREAM_TYPE = 1;
const DEFAULT_PROTOCOL = "tcp";
const LEADING_SLASH_PATTERN = /^\//;

interface PortBinding {
  HostPort?: string;
}

function formatEnvVar(key: string, value: string): string {
  return `${key}=${value}`;
}

function formatEnvVars(
  env: Record<string, string> | undefined
): string[] | undefined {
  if (!env) {
    return undefined;
  }

  return Object.entries(env).map(([key, value]) => formatEnvVar(key, value));
}

function orUndefinedIfEmpty<T extends object>(obj: T): T | undefined {
  return Object.keys(obj).length > 0 ? obj : undefined;
}

function orUndefinedIfEmptyArray<T>(arr: T[]): T[] | undefined {
  return arr.length > 0 ? arr : undefined;
}

function parseContainerPort(portKey: string): number {
  const portString = portKey.split("/")[0] ?? "";
  return Number.parseInt(portString, 10);
}

function parseHostPort(binding: PortBinding): number | null {
  if (!binding.HostPort) {
    return null;
  }

  return Number.parseInt(binding.HostPort, 10);
}

function extractPortMappings(
  portBindings: Record<string, PortBinding[] | null> | undefined
): Record<number, number> {
  const ports: Record<number, number> = {};

  if (!portBindings) {
    return ports;
  }

  for (const [containerPort, bindings] of Object.entries(portBindings)) {
    const hostBinding = bindings?.[0];
    if (!hostBinding) {
      continue;
    }

    const hostPort = parseHostPort(hostBinding);
    if (hostPort === null) {
      continue;
    }

    ports[parseContainerPort(containerPort)] = hostPort;
  }

  return ports;
}

function stripLeadingSlash(name: string): string {
  return name.replace(LEADING_SLASH_PATTERN, "");
}

function determineStreamType(
  streamTypeByte: number | undefined
): "stdout" | "stderr" {
  return streamTypeByte === STDOUT_STREAM_TYPE ? "stdout" : "stderr";
}

export class DockerContainerManager implements ContainerManager {
  private readonly docker: Dockerode;

  constructor(docker: Dockerode) {
    this.docker = docker;
  }

  async createContainer(options: ContainerCreateOptions): Promise<string> {
    const { exposedPorts, portBindings } = this.buildPortConfiguration(
      options.ports
    );
    const volumeBinds = this.buildVolumeBinds(options.volumes);
    const restartPolicy = this.buildRestartPolicy(options.restartPolicy);

    const container = await this.docker.createContainer({
      name: options.name,
      Image: options.image,
      Cmd: options.command,
      Entrypoint: options.entrypoint,
      WorkingDir: options.workdir,
      Hostname: options.hostname,
      Env: formatEnvVars(options.env),
      Labels: options.labels,
      ExposedPorts: orUndefinedIfEmpty(exposedPorts),
      platform: options.platform,
      HostConfig: {
        PortBindings: orUndefinedIfEmpty(portBindings),
        Binds: orUndefinedIfEmptyArray(volumeBinds),
        NetworkMode: options.networkMode,
        Privileged: options.privileged,
        RestartPolicy: restartPolicy,
      },
    });

    return container.id;
  }

  private buildPortConfiguration(ports?: ContainerCreateOptions["ports"]): {
    exposedPorts: Record<string, object>;
    portBindings: Record<string, { HostPort: string }[]>;
  } {
    const exposedPorts: Record<string, object> = {};
    const portBindings: Record<string, { HostPort: string }[]> = {};

    if (!ports) {
      return { exposedPorts, portBindings };
    }

    for (const portMapping of ports) {
      const protocol = portMapping.protocol ?? DEFAULT_PROTOCOL;
      const portKey = `${portMapping.container}/${protocol}`;
      exposedPorts[portKey] = {};
      portBindings[portKey] = [
        { HostPort: portMapping.host?.toString() ?? "" },
      ];
    }

    return { exposedPorts, portBindings };
  }

  private buildVolumeBinds(
    volumes?: ContainerCreateOptions["volumes"]
  ): string[] {
    if (!volumes) {
      return [];
    }

    return volumes.map((volume) => {
      const mode = volume.readonly ? "ro" : "rw";
      return `${volume.source}:${volume.target}:${mode}`;
    });
  }

  private buildRestartPolicy(
    restartPolicy?: ContainerCreateOptions["restartPolicy"]
  ):
    | {
        Name: string;
        MaximumRetryCount?: number;
      }
    | undefined {
    if (!restartPolicy) {
      return undefined;
    }

    return {
      Name: restartPolicy.name,
      MaximumRetryCount: restartPolicy.maximumRetryCount,
    };
  }

  async startContainer(containerId: string): Promise<void> {
    await this.docker.getContainer(containerId).start();
  }

  async stopContainer(containerId: string, timeoutSeconds = 10): Promise<void> {
    try {
      await this.docker.getContainer(containerId).stop({ t: timeoutSeconds });
    } catch (error) {
      if (isNotRunningError(error) || isNotFoundError(error)) {
        return;
      }
      throw error;
    }
  }

  async removeContainer(containerId: string, force = false): Promise<void> {
    try {
      await this.docker.getContainer(containerId).remove({ force });
    } catch (error) {
      if (isNotFoundError(error)) {
        return;
      }
      throw error;
    }
  }

  async restartContainer(
    containerId: string,
    timeoutSeconds = 10
  ): Promise<void> {
    await this.docker.getContainer(containerId).restart({ t: timeoutSeconds });
  }

  async inspectContainer(containerId: string): Promise<ContainerInfo> {
    const containerData = await this.docker.getContainer(containerId).inspect();
    const ports = extractPortMappings(containerData.NetworkSettings.Ports);

    return {
      id: containerData.Id,
      name: stripLeadingSlash(containerData.Name),
      image: containerData.Config.Image,
      status: containerData.State.Status,
      state: toContainerState(containerData.State.Status),
      ports,
      labels: containerData.Config.Labels ?? {},
    };
  }

  async waitContainer(containerId: string): Promise<ExitResult> {
    const result = await this.docker.getContainer(containerId).wait();
    return { exitCode: result.StatusCode };
  }

  async containerExists(containerId: string): Promise<boolean> {
    try {
      await this.docker.getContainer(containerId).inspect();
      return true;
    } catch (error) {
      if (isNotFoundError(error)) {
        return false;
      }
      throw error;
    }
  }

  async *streamLogs(
    containerId: string,
    options: { tail?: number } = {}
  ): AsyncGenerator<LogChunk> {
    const logStream = (await this.docker.getContainer(containerId).logs({
      follow: true,
      stdout: true,
      stderr: true,
      tail: options.tail,
    })) as NodeJS.ReadableStream;

    yield* this.parseLogStream(logStream);
  }

  private async *parseLogStream(
    logStream: NodeJS.ReadableStream
  ): AsyncGenerator<LogChunk> {
    let buffer: Buffer<ArrayBufferLike> = Buffer.alloc(0);
    const pendingChunks: LogChunk[] = [];
    let resolveWait: (() => void) | null = null;
    let streamEnded = false;
    let streamError: Error | null = null;

    const tryResolveWait = () => {
      if (resolveWait) {
        resolveWait();
        resolveWait = null;
      }
    };

    const parseFramesFromBuffer = () => {
      while (this.hasCompleteFrame(buffer)) {
        const { chunk, remainingBuffer } = this.extractFrame(buffer);
        buffer = remainingBuffer;
        pendingChunks.push(chunk);
      }
    };

    logStream.on("data", (chunk: Buffer | string) => {
      const chunkBuffer =
        typeof chunk === "string" ? Buffer.from(chunk) : chunk;
      buffer = Buffer.concat([buffer, chunkBuffer]);
      parseFramesFromBuffer();
      tryResolveWait();
    });

    logStream.on("end", () => {
      streamEnded = true;
      tryResolveWait();
    });

    logStream.on("error", (error: Error) => {
      streamError = error;
      streamEnded = true;
      tryResolveWait();
    });

    while (!streamEnded || pendingChunks.length > 0) {
      if (pendingChunks.length > 0) {
        const chunk = pendingChunks.shift();
        if (chunk) {
          yield chunk;
        }
        continue;
      }

      if (!streamEnded) {
        await new Promise<void>((resolve) => {
          resolveWait = resolve;
        });
      }
    }

    if (streamError) {
      throw streamError;
    }
  }

  private hasCompleteFrame(buffer: Buffer<ArrayBufferLike>): boolean {
    if (buffer.length < DOCKER_LOG_HEADER_SIZE) {
      return false;
    }

    const frameSize = buffer.readUInt32BE(DOCKER_LOG_SIZE_OFFSET);
    return buffer.length >= DOCKER_LOG_HEADER_SIZE + frameSize;
  }

  private extractFrame(buffer: Buffer<ArrayBufferLike>): {
    chunk: LogChunk;
    remainingBuffer: Buffer<ArrayBufferLike>;
  } {
    const streamType = buffer[0];
    const frameSize = buffer.readUInt32BE(DOCKER_LOG_SIZE_OFFSET);
    const frameData = buffer.subarray(
      DOCKER_LOG_HEADER_SIZE,
      DOCKER_LOG_HEADER_SIZE + frameSize
    );
    const remainingBuffer = buffer.subarray(DOCKER_LOG_HEADER_SIZE + frameSize);

    return {
      chunk: {
        stream: determineStreamType(streamType),
        data: new Uint8Array(frameData),
      },
      remainingBuffer,
    };
  }
}
