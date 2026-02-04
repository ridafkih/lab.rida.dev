FROM oven/bun:1 AS base
WORKDIR /app

FROM base AS source
COPY . .

FROM base AS prune
RUN bun install --global turbo
COPY --from=source /app .
RUN turbo prune @lab/mcp --docker

FROM base AS build
COPY --from=prune /app/out/json/ .
RUN bun install --ignore-scripts
COPY --from=prune /app/out/full/ .

FROM base AS runtime
COPY --from=prune /app/out/json/ .
RUN bun install --ignore-scripts
COPY --from=build /app/services/mcp/src ./services/mcp/src
COPY --from=build /app/packages/sandbox-sdk/src ./packages/sandbox-sdk/src
COPY --from=build /app/packages/sandbox-docker/src ./packages/sandbox-docker/src
COPY --from=build /app/packages/browser-protocol/src ./packages/browser-protocol/src

ENV NODE_ENV=production
ENV MCP_PORT=3000
EXPOSE 3000

CMD ["bun", "run", "--cwd", "services/mcp", "start"]
