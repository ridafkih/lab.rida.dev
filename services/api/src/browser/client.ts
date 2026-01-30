export interface DaemonStatus {
  running: boolean;
  ready: boolean;
  port: number | null;
}

export interface DaemonInfo {
  sessionId: string;
  port: number;
  ready: boolean;
}

export class BrowserClient {
  private readonly baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  async startDaemon(
    sessionId: string,
    options: { streamPort?: number } = {},
  ): Promise<{ port: number }> {
    const response = await fetch(`${this.baseUrl}/daemons/${sessionId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        streamPort: options.streamPort,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Failed to start daemon: ${response.status} - ${body}`);
    }

    const data = await response.json();
    return { port: data.port };
  }

  async stopDaemon(sessionId: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/daemons/${sessionId}`, {
      method: "DELETE",
    });

    if (!response.ok && response.status !== 404) {
      const body = await response.text();
      throw new Error(`Failed to stop daemon: ${response.status} - ${body}`);
    }
  }

  async getDaemonStatus(sessionId: string): Promise<DaemonStatus> {
    try {
      const response = await fetch(`${this.baseUrl}/daemons/${sessionId}`);

      if (!response.ok) {
        return { running: false, ready: false, port: null };
      }

      const data = await response.json();
      return {
        running: data.running ?? false,
        ready: data.ready ?? false,
        port: data.port ?? null,
      };
    } catch {
      return { running: false, ready: false, port: null };
    }
  }

  async listDaemons(): Promise<DaemonInfo[]> {
    try {
      const response = await fetch(`${this.baseUrl}/daemons`);

      if (!response.ok) {
        return [];
      }

      const data = await response.json();
      return data.daemons ?? [];
    } catch {
      return [];
    }
  }

  async isHealthy(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/health`);
      return response.ok;
    } catch {
      return false;
    }
  }

  async launchBrowser(sessionId: string): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/daemons/${sessionId}/launch`, {
        method: "POST",
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async getCurrentUrl(sessionId: string): Promise<string | null> {
    try {
      const response = await fetch(`${this.baseUrl}/daemons/${sessionId}/url`);
      if (!response.ok) return null;
      const data = await response.json();
      return data.url ?? null;
    } catch {
      return null;
    }
  }

  async navigateTo(sessionId: string, url: string): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/daemons/${sessionId}/navigate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      if (!response.ok) {
        const body = await response.text();
        console.warn(
          `[BrowserClient] Navigate failed for ${sessionId}: ${response.status} - ${body}`,
        );
      }
      return response.ok;
    } catch (err) {
      console.warn(`[BrowserClient] Navigate error for ${sessionId}:`, err);
      return false;
    }
  }
}
