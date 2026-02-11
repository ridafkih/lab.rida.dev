import type {
  ContainerCreateOptions,
  ContainerEvent,
  ContainerEventStream,
  ContainerEventStreamOptions,
  ContainerInfo,
  ExecOptions,
  ExecResult,
  ExitResult,
  ImageConfig,
  LogChunk,
  NetworkCreateOptions,
  NetworkInfo,
  SandboxProvider,
} from "@lab/sandbox-sdk";
import Dockerode from "dockerode";
import {
  DEFAULT_DOCKER_PORT,
  DEFAULT_DOCKER_PROTOCOL,
  DEFAULT_SOCKET_PATH,
} from "../constants";
import { DockerContainerManager } from "../modules/docker-container-manager";
import { DockerEventStream } from "../modules/docker-event-stream";
import { DockerImageManager } from "../modules/docker-image-manager";
import { DockerVolumeManager } from "../modules/docker-volume-manager";
import { ExecOperations } from "../modules/exec-operations";
import { NetworkOperations } from "../modules/network-operations";
import { WorkspaceUtilityContainer } from "../modules/workspace-utility-container";
import type { DockerClientOptions } from "../types/client";

export class DockerClient implements SandboxProvider, ContainerEventStream {
  private readonly docker: Dockerode;
  private readonly imageManager: DockerImageManager;
  private readonly containerManager: DockerContainerManager;
  private readonly volumeManager: DockerVolumeManager;
  private readonly networkOps: NetworkOperations;
  private readonly execOps: ExecOperations;
  private readonly eventStream: DockerEventStream;

  constructor(options: DockerClientOptions = {}) {
    if (options.host) {
      this.docker = new Dockerode({
        host: options.host,
        port: options.port ?? DEFAULT_DOCKER_PORT,
        protocol: options.protocol ?? DEFAULT_DOCKER_PROTOCOL,
      });
    } else {
      this.docker = new Dockerode({
        socketPath: options.socketPath ?? DEFAULT_SOCKET_PATH,
      });
    }

    this.imageManager = new DockerImageManager(this.docker);
    this.containerManager = new DockerContainerManager(this.docker);
    this.volumeManager = new DockerVolumeManager(
      this.docker,
      this.containerManager
    );
    this.networkOps = new NetworkOperations(this.docker);
    this.execOps = new ExecOperations(this.docker);
    this.eventStream = new DockerEventStream(this.docker);
  }

  get raw(): Dockerode {
    return this.docker;
  }

  pullImage(
    imageRef: string,
    onProgress?: (event: { status: string; progress?: string }) => void
  ): Promise<void> {
    return this.imageManager.pullImage(imageRef, onProgress);
  }

  imageExists(imageRef: string): Promise<boolean> {
    return this.imageManager.imageExists(imageRef);
  }

  getImageWorkdir(imageRef: string): Promise<string> {
    return this.imageManager.getImageWorkdir(imageRef);
  }

  getImageConfig(imageRef: string): Promise<ImageConfig> {
    return this.imageManager.getImageConfig(imageRef);
  }

  createContainer(options: ContainerCreateOptions): Promise<string> {
    return this.containerManager.createContainer(options);
  }

  startContainer(containerId: string): Promise<void> {
    return this.containerManager.startContainer(containerId);
  }

  stopContainer(containerId: string, timeoutSeconds?: number): Promise<void> {
    return this.containerManager.stopContainer(containerId, timeoutSeconds);
  }

  removeContainer(containerId: string, force?: boolean): Promise<void> {
    return this.containerManager.removeContainer(containerId, force);
  }

  restartContainer(
    containerId: string,
    timeoutSeconds?: number
  ): Promise<void> {
    return this.containerManager.restartContainer(containerId, timeoutSeconds);
  }

  inspectContainer(containerId: string): Promise<ContainerInfo> {
    return this.containerManager.inspectContainer(containerId);
  }

  waitContainer(containerId: string): Promise<ExitResult> {
    return this.containerManager.waitContainer(containerId);
  }

  containerExists(containerId: string): Promise<boolean> {
    return this.containerManager.containerExists(containerId);
  }

  streamLogs(
    containerId: string,
    options?: { tail?: number }
  ): AsyncGenerator<LogChunk> {
    return this.containerManager.streamLogs(containerId, options);
  }

  createVolume(name: string, labels?: Record<string, string>): Promise<void> {
    return this.volumeManager.createVolume(name, labels);
  }

  removeVolume(name: string): Promise<void> {
    return this.volumeManager.removeVolume(name);
  }

  volumeExists(name: string): Promise<boolean> {
    return this.volumeManager.volumeExists(name);
  }

  cloneVolume(sourceVolume: string, targetVolume: string): Promise<void> {
    return this.volumeManager.cloneVolume(sourceVolume, targetVolume);
  }

  createNetwork(name: string, options?: NetworkCreateOptions): Promise<void> {
    return this.networkOps.createNetwork(name, options);
  }

  removeNetwork(name: string): Promise<void> {
    return this.networkOps.removeNetwork(name);
  }

  networkExists(name: string): Promise<boolean> {
    return this.networkOps.networkExists(name);
  }

  isConnectedToNetwork(
    containerIdOrName: string,
    networkName: string
  ): Promise<boolean> {
    return this.networkOps.isConnectedToNetwork(containerIdOrName, networkName);
  }

  connectToNetwork(
    containerId: string,
    networkName: string,
    options?: { aliases?: string[] }
  ): Promise<void> {
    return this.networkOps.connectToNetwork(containerId, networkName, options);
  }

  disconnectFromNetwork(
    containerId: string,
    networkName: string
  ): Promise<void> {
    return this.networkOps.disconnectFromNetwork(containerId, networkName);
  }

  listNetworks(options?: { labels?: string[] }): Promise<NetworkInfo[]> {
    return this.networkOps.listNetworks(options);
  }

  exec(containerId: string, options: ExecOptions): Promise<ExecResult> {
    return this.execOps.exec(containerId, options);
  }

  streamContainerEvents(
    options?: ContainerEventStreamOptions
  ): AsyncGenerator<ContainerEvent> {
    return this.eventStream.streamContainerEvents(options);
  }

  createWorkspaceUtilityContainer(
    workspacesVolume: string,
    workspacesMount: string
  ): WorkspaceUtilityContainer {
    return new WorkspaceUtilityContainer(
      this.containerManager,
      this.imageManager,
      this.execOps,
      workspacesVolume,
      workspacesMount
    );
  }
}
