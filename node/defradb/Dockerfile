# Self-bootstrapping Source Network defradb.rs v0.20.0 container (Apache-2.0 / MIT)
# Strictly uses sourcenetwork/defradb.rs (NEVER the BSL 1.1 Go binary).
FROM ubuntu:24.04

ARG DEFRADB_VERSION=v0.20.0
ARG TARGETARCH=amd64

RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates curl libssl3t64 libdbus-1-3 \
    && rm -rf /var/lib/apt/lists/*

RUN ARCH="${TARGETARCH}" && \
    if [ "${ARCH}" != "arm64" ]; then ARCH="amd64"; fi && \
    curl -fsSL "https://github.com/sourcenetwork/defradb.rs/releases/download/${DEFRADB_VERSION}/defra_${DEFRADB_VERSION}_linux_${ARCH}.tar.gz" -o /tmp/defradb.tar.gz && \
    tar -xzf /tmp/defradb.tar.gz -C /usr/local/bin && \
    rm -f /tmp/defradb.tar.gz && \
    chmod +x /usr/local/bin/defradb || chmod +x /usr/local/bin/defra || true && \
    if [ -f /usr/local/bin/defra ] && [ ! -f /usr/local/bin/defradb ]; then ln -s /usr/local/bin/defra /usr/local/bin/defradb; fi && \
    defradb version

WORKDIR /opt/ftdp-defradb
COPY node/defradb/policies ./policies
COPY node/defradb/schemas ./schemas
COPY node/defradb/bootstrap-defradb.sh ./bootstrap-defradb.sh
COPY node/defradb/entrypoint.sh ./entrypoint.sh
RUN sed -i 's/\r$//' ./bootstrap-defradb.sh ./entrypoint.sh && chmod +x ./bootstrap-defradb.sh ./entrypoint.sh && mkdir -p /data/defradb

ENV PORT=9181
EXPOSE 9181 9171

HEALTHCHECK --interval=15s --timeout=5s --start-period=15s \
  CMD sh -c 'curl -sf "http://127.0.0.1:${PORT:-9181}/health-check" || exit 1'

ENTRYPOINT ["/opt/ftdp-defradb/entrypoint.sh"]
