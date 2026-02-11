export type RestartPolicyName =
  | "no"
  | "always"
  | "on-failure"
  | "unless-stopped";

export interface RestartPolicy {
  name: RestartPolicyName;
  maximumRetryCount?: number;
}

export interface ContainerCreateOptions {
  image: string;
  name?: string;
  command?: string[];
  entrypoint?: string[];
  workdir?: string;
  env?: Record<string, string>;
  labels?: Record<string, string>;
  hostname?: string;
  ports?: PortMapping[];
  volumes?: VolumeBinding[];
  networkMode?: string;
  privileged?: boolean;
  restartPolicy?: RestartPolicy;
  platform?: string;
}

export interface PortMapping {
  container: number;
  host?: number;
  protocol?: "tcp" | "udp";
}

export interface VolumeBinding {
  source: string;
  target: string;
  readonly?: boolean;
}

export type ContainerState =
  | "created"
  | "running"
  | "paused"
  | "restarting"
  | "removing"
  | "exited"
  | "dead";

export interface ContainerInfo {
  id: string;
  name: string;
  image: string;
  status: string;
  state: ContainerState;
  ports: Record<number, number>;
  labels: Record<string, string>;
}

export interface ExitResult {
  exitCode: number;
}

export interface LogChunk {
  stream: "stdout" | "stderr";
  data: Uint8Array;
}
