import type { ImageConfig, ImageManager } from "@lab/sandbox-sdk";
import type Dockerode from "dockerode";
import { isNotFoundError } from "../utils/error-handling";

export class DockerImageManager implements ImageManager {
  private readonly docker: Dockerode;
  private readonly modem: Dockerode["modem"];
  private readonly configCache = new Map<string, ImageConfig>();

  constructor(docker: Dockerode) {
    this.docker = docker;
    this.modem = docker.modem;
  }

  async pullImage(
    imageRef: string,
    onProgress?: (event: { status: string; progress?: string }) => void
  ): Promise<void> {
    this.configCache.delete(imageRef);

    const pullStream = await this.docker.pull(imageRef);

    await new Promise<void>((resolve, reject) => {
      this.modem.followProgress(
        pullStream,
        (error: Error | null) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        },
        onProgress
      );
    });
  }

  async imageExists(imageRef: string): Promise<boolean> {
    try {
      await this.docker.getImage(imageRef).inspect();
      return true;
    } catch (error) {
      if (isNotFoundError(error)) {
        return false;
      }
      throw error;
    }
  }

  async getImageWorkdir(imageRef: string): Promise<string> {
    const imageInfo = await this.docker.getImage(imageRef).inspect();
    return imageInfo.Config.WorkingDir || "/";
  }

  async getImageConfig(imageRef: string): Promise<ImageConfig> {
    const cached = this.configCache.get(imageRef);
    if (cached) {
      return cached;
    }

    const imageInfo = await this.docker.getImage(imageRef).inspect();
    const entrypoint = imageInfo.Config.Entrypoint;

    const config: ImageConfig = {
      workdir: imageInfo.Config.WorkingDir || "/",
      entrypoint:
        typeof entrypoint === "string" ? [entrypoint] : (entrypoint ?? null),
      cmd: imageInfo.Config.Cmd ?? null,
    };

    this.configCache.set(imageRef, config);
    return config;
  }
}
