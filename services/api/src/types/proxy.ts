export interface RouteInfo {
  containerPort: number;
  url: string;
}

export interface ClusterContainer {
  containerId: string;
  hostname: string;
  ports: Record<number, number>;
}
