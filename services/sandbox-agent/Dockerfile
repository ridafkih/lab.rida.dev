FROM alpine:3.21

RUN apk add --no-cache curl ca-certificates libstdc++ libgcc bash \
    && curl -fsSL https://releases.rivet.dev/sandbox-agent/latest/install.sh | sh \
    && sandbox-agent install-agent claude

EXPOSE 3000

ENTRYPOINT ["sandbox-agent", "server", "--no-token", "--host", "0.0.0.0", "--port", "3000"]
