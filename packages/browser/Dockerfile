FROM mcr.microsoft.com/playwright:v1.58.0-noble

RUN npm install -g bun

WORKDIR /app

COPY package.json ./
COPY packages/browser/package.json ./packages/browser/
COPY packages/database/package.json ./packages/database/

RUN bun install --filter @lab/browser

RUN chmod +x /app/node_modules/.bun/agent-browser@*/node_modules/agent-browser/bin/agent-browser-linux-* 2>/dev/null || \
  chmod +x /app/node_modules/agent-browser/bin/agent-browser-linux-* 2>/dev/null || true

COPY packages/browser/src ./packages/browser/src
COPY packages/database/src ./packages/database/src

WORKDIR /app/packages/browser

ENV AGENT_BROWSER_SOCKET_DIR=/tmp/agent-browser-socket
ENV AGENT_BROWSER_STREAM_PORT=9223
ENV AGENT_BROWSER_SESSION=default

EXPOSE 9223

CMD ["bun", "run", "src/entrypoint.ts"]
