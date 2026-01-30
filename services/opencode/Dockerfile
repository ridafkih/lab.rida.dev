FROM ghcr.io/anomalyco/opencode

USER root

RUN apk add --no-cache nodejs npm gcompat && \
  npm install -g agent-browser@latest

RUN AGENT_BIN=$(which agent-browser) && \
  mv "$AGENT_BIN" "${AGENT_BIN}.real" && \
  printf '#!/bin/sh\nif echo "$PWD" | grep -q "^/workspaces/"; then\n  export AGENT_BROWSER_SESSION=$(echo "$PWD" | cut -d"/" -f3)\nfi\nexec agent-browser.real "$@"\n' > "$AGENT_BIN" && \
  chmod +x "$AGENT_BIN"
