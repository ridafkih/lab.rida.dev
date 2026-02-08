import pino from "pino";
import { widelogger } from "@lab/widelogger";

const environment = process.env.NODE_ENV ?? "development";
const isDevelopment = environment !== "production";

const serviceVersion = process.env.API_VERSION ?? process.env.npm_package_version;
const commitHash =
  process.env.COMMIT_SHA ?? process.env.GIT_COMMIT_SHA ?? process.env.VERCEL_GIT_COMMIT_SHA;
const instanceId = process.env.INSTANCE_ID ?? process.env.HOSTNAME ?? String(process.pid);

const transport = isDevelopment
  ? pino.transport({
      target: "pino-pretty",
      options: {
        colorize: true,
        singleLine: true,
        translateTime: "SYS:standard",
        ignore: "pid,hostname",
      },
    })
  : undefined;

export const logger = pino(
  {
    level: process.env.LOG_LEVEL ?? "info",
    timestamp: pino.stdTimeFunctions.isoTime,
    base: {
      service: "platform-bridge",
      service_version: serviceVersion,
      commit_hash: commitHash ?? "unknown",
      instance_id: instanceId,
      environment,
    },
  },
  transport,
);

const { widelog } = widelogger({
  transport: (event) => {
    if (Object.keys(event).length === 0) return;

    const isError = event.outcome === "error";
    const payload = { event_name: "platform_bridge.operation", ...event };

    if (isError) {
      logger.error(payload);
      return;
    }

    logger.info(payload);
  },
});

export { widelog };
