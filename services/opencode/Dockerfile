FROM ghcr.io/anomalyco/opencode

USER root

RUN apk add --no-cache nodejs npm gcompat && \
  npm install -g agent-browser@latest

# Patch daemon.js to prevent spawning local daemons
# Replace startDaemon function to exit immediately
RUN sed -i 's/export async function startDaemon/export async function startDaemon(options) { process.exit(1); } function _startDaemon/' \
  /usr/local/lib/node_modules/agent-browser/dist/daemon.js

RUN AGENT_BIN=$(which agent-browser) && \
  mv "$AGENT_BIN" "${AGENT_BIN}.real" && \
  printf '#!/bin/sh\nif echo "$PWD" | grep -q "^/workspaces/"; then\n  export AGENT_BROWSER_SESSION=$(echo "$PWD" | cut -d"/" -f3)\nfi\nexec agent-browser.real "$@"\n' > "$AGENT_BIN" && \
  chmod +x "$AGENT_BIN"
