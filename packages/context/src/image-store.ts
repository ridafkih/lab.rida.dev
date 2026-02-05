import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { resizeImage } from "@lab/ffmpeg";

export interface ImageStoreConfig {
  endpoint: string;
  accessKey: string;
  secretKey: string;
  bucket: string;
  publicUrl: string;
}

export interface StoreOptions {
  /** Whether to resize the image to max 1568px. Default: true */
  resize?: boolean;
  /** Maximum dimension for resizing. Default: 1568 */
  maxDimension?: number;
  /** Custom key prefix (e.g., "screenshots/", "avatars/"). Default: "images/" */
  prefix?: string;
  /** Content type. Default: "image/png" */
  contentType?: string;
}

export interface StoreResult {
  url: string;
  key: string;
  width?: number;
  height?: number;
  wasResized: boolean;
  originalSize: number;
  finalSize: number;
}

/**
 * Generic image store for uploading images to S3-compatible storage.
 * Supports automatic resizing to reduce token usage when images are used with Claude.
 */
export class ImageStore {
  private s3: S3Client;
  private config: ImageStoreConfig;

  constructor(config: ImageStoreConfig) {
    this.config = config;
    this.s3 = new S3Client({
      endpoint: config.endpoint,
      region: "us-east-1",
      credentials: {
        accessKeyId: config.accessKey,
        secretAccessKey: config.secretKey,
      },
      forcePathStyle: true,
    });
  }

  /**
   * Store an image from a Buffer.
   *
   * @param buffer - Image buffer data
   * @param options - Storage options
   * @returns URL and metadata about the stored image
   */
  async store(buffer: Buffer, options: StoreOptions = {}): Promise<StoreResult> {
    const {
      resize = true,
      maxDimension = 1568,
      prefix = "images/",
      contentType = "image/png",
    } = options;

    const originalSize = buffer.length;
    let finalBuffer = buffer;
    let width: number | undefined;
    let height: number | undefined;
    let wasResized = false;

    if (resize) {
      try {
        const result = resizeImage(buffer, maxDimension);
        finalBuffer = result.buffer;
        width = result.width;
        height = result.height;
        wasResized = result.wasResized;
      } catch (error) {
        // If resize fails, use original buffer
        console.warn("[ImageStore] Resize failed, using original:", error);
      }
    }

    const key = `${prefix}${Date.now()}-${crypto.randomUUID()}.png`;

    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
        Body: finalBuffer,
        ContentType: contentType,
      }),
    );

    return {
      url: `${this.config.publicUrl}/${this.config.bucket}/${key}`,
      key,
      width,
      height,
      wasResized,
      originalSize,
      finalSize: finalBuffer.length,
    };
  }

  /**
   * Store an image from base64-encoded data.
   *
   * @param base64 - Base64-encoded image data
   * @param options - Storage options
   * @returns URL and metadata about the stored image
   */
  async storeBase64(base64: string, options: StoreOptions = {}): Promise<StoreResult> {
    const buffer = Buffer.from(base64, "base64");
    return this.store(buffer, options);
  }
}

/**
 * Create an ImageStore from environment variables.
 * Expects: RUSTFS_ENDPOINT, RUSTFS_ACCESS_KEY, RUSTFS_SECRET_KEY, RUSTFS_BUCKET, RUSTFS_PUBLIC_URL
 */
export function createImageStoreFromEnv(): ImageStore {
  const endpoint = process.env.RUSTFS_ENDPOINT;
  const accessKey = process.env.RUSTFS_ACCESS_KEY;
  const secretKey = process.env.RUSTFS_SECRET_KEY;
  const bucket = process.env.RUSTFS_BUCKET;
  const publicUrl = process.env.RUSTFS_PUBLIC_URL;

  if (!endpoint || !accessKey || !secretKey || !bucket || !publicUrl) {
    throw new Error(
      "Missing RustFS config. Set RUSTFS_ENDPOINT, RUSTFS_ACCESS_KEY, RUSTFS_SECRET_KEY, RUSTFS_BUCKET, RUSTFS_PUBLIC_URL",
    );
  }

  return new ImageStore({
    endpoint,
    accessKey,
    secretKey,
    bucket,
    publicUrl,
  });
}
