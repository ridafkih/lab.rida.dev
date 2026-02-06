FROM oven/bun:1 AS base
WORKDIR /app

FROM base AS source
COPY . .

FROM base AS prune
RUN bun install --global turbo pino-pretty
COPY --from=source /app .
RUN turbo prune @lab/api --docker

FROM base AS build
COPY --from=prune /app/out/json/ .
RUN bun install --ignore-scripts
COPY --from=prune /app/out/full/ .

FROM base AS runtime

# Install FFmpeg development libraries and C headers for native image resizing
RUN apt-get update && apt-get install -y --no-install-recommends \
  libc6-dev \
  libavcodec-dev \
  libavformat-dev \
  libavutil-dev \
  libswscale-dev \
  && rm -rf /var/lib/apt/lists/*

COPY --from=prune /app/out/json/ .
RUN bun install --ignore-scripts
COPY --from=build /app/services/api/src ./services/api/src
COPY --from=build /app/packages/sandbox-sdk/src ./packages/sandbox-sdk/src
COPY --from=build /app/packages/database/src ./packages/database/src
COPY --from=build /app/packages/sandbox-docker/src ./packages/sandbox-docker/src
COPY --from=build /app/packages/multiplayer-server/src ./packages/multiplayer-server/src
COPY --from=build /app/packages/multiplayer-sdk/src ./packages/multiplayer-sdk/src
COPY --from=build /app/packages/browser-protocol/src ./packages/browser-protocol/src
COPY --from=build /app/packages/subagents/src ./packages/subagents/src
COPY --from=build /app/packages/ffmpeg/src ./packages/ffmpeg/src
COPY --from=build /app/packages/context/src ./packages/context/src
COPY --from=build /app/packages/entry-point/src ./packages/entry-point/src
COPY --from=build /app/packages/http-utilities/src ./packages/http-utilities/src
COPY --from=build /app/packages/router/src ./packages/router/src
COPY --from=build /app/packages/widelogger/src ./packages/widelogger/src
COPY --from=build /app/packages/prompts-sdk/src ./packages/prompts-sdk/src

ENV NODE_ENV=production
EXPOSE 4000

CMD ["/bin/sh", "-c", "bun run --cwd services/api start | pino-pretty"]
