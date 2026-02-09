import {
  S3Client,
  CreateBucketCommand,
  PutBucketPolicyCommand,
  HeadBucketCommand,
} from "@aws-sdk/client-s3";
import { widelog } from "../logging";
import type { Config } from "../types/tool";

function createS3Client(config: Config): S3Client {
  return new S3Client({
    endpoint: config.RUSTFS_ENDPOINT,
    region: config.RUSTFS_REGION,
    credentials: {
      accessKeyId: config.RUSTFS_ACCESS_KEY,
      secretAccessKey: config.RUSTFS_SECRET_KEY,
    },
    forcePathStyle: true,
  });
}

export async function initializeBucket(config: Config): Promise<void> {
  return widelog.context(async () => {
    widelog.set("event_name", "rustfs.bucket_initialized");
    widelog.set("bucket", config.RUSTFS_BUCKET);
    widelog.time.start("duration_ms");

    const s3 = createS3Client(config);
    const bucket = config.RUSTFS_BUCKET;

    try {
      await s3.send(new HeadBucketCommand({ Bucket: bucket }));
      widelog.set("bucket_existed", true);
    } catch (error: unknown) {
      if (error && typeof error === "object" && "name" in error && error.name === "NotFound") {
        widelog.set("bucket_existed", false);
        await s3.send(new CreateBucketCommand({ Bucket: bucket }));
      } else {
        widelog.set("outcome", "error");
        widelog.errorFields(error);
        widelog.time.stop("duration_ms");
        widelog.flush();
        throw error;
      }
    }

    const policy = {
      Version: "2012-10-17",
      Statement: [
        {
          Effect: "Allow",
          Principal: "*",
          Action: ["s3:GetObject"],
          Resource: [`arn:aws:s3:::${bucket}/*`],
        },
      ],
    };

    await s3.send(
      new PutBucketPolicyCommand({
        Bucket: bucket,
        Policy: JSON.stringify(policy),
      }),
    );

    widelog.set("outcome", "success");
    widelog.time.stop("duration_ms");
    widelog.flush();
  });
}
