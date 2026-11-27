#!/usr/bin/env bash
set -euo pipefail

PORT="${PORT:-9181}"
DATA_DIR="${DEFRADB_DATA_DIR:-/data/defradb}"
mkdir -p "${DATA_DIR}"

echo "[ftdp-defradb] Starting Apache-2.0/MIT sourcenetwork/defradb.rs on 0.0.0.0:${PORT}..."
defradb start \
  --rootdir "${DATA_DIR}" \
  --url "0.0.0.0:${PORT}" \
  --p2paddr "/ip4/0.0.0.0/tcp/9171" \
  --no-keyring \
  &
DEFRA_PID=$!

trap 'kill -TERM "${DEFRA_PID}" 2>/dev/null || true; wait "${DEFRA_PID}" 2>/dev/null || true' SIGTERM SIGINT

# Wait for HTTP API readiness
for i in $(seq 1 60); do
  if curl -sf "http://127.0.0.1:${PORT}/health-check" >/dev/null 2>&1; then
    echo "[ftdp-defradb] Ready on port ${PORT}."
    break
  fi
  sleep 1
done

# Idempotently apply FTDP v1 + Comment Protocol v1 GraphQL schemas (non-policy staging bootstrap)
echo "[ftdp-defradb] Bootstrapping FTDP v1 & Comment Protocol v1 schemas..."
SCHEMA_PAYLOAD='type FtdpAnonRecord {
  recordId: String @index(unique: true)
  deploymentId: String @index
  uidHash: String @index
  dataId: String @index
  schemaVersion: String
  timestamp: Int @index
  source: String
  flags: String
  anonJson: String
}

type FtdpPiiVault {
  recordId: String @index(unique: true)
  deploymentId: String @index
  uidHash: String @index
  piiCiphertext: String
  kmsKeyVersion: String
  timestamp: Int
}

type FtdpConsentState {
  deploymentId: String @index
  uidHash: String @index
  flags: String
  updatedAt: Int
}

type CommentRecord {
  recordId: String @index(unique: true)
  deploymentId: String @index
  uidHash: String @index
  targetUri: String @index
  parentId: String @index
  body: String
  flags: String
  timestamp: Int @index
}

type RatingRecord {
  recordId: String @index(unique: true)
  deploymentId: String @index
  uidHash: String @index
  targetUri: String @index
  score: Float
  maxScore: Float
  review: String
  flags: String
  timestamp: Int @index
}

type VoteRecord {
  recordId: String @index(unique: true)
  deploymentId: String @index
  uidHash: String @index
  targetUri: String @index
  direction: Int
  flags: String
  timestamp: Int @index
}'

curl -sS -X POST "http://127.0.0.1:${PORT}/api/v0/collections" \
  -H "Content-Type: text/plain" \
  --data-binary "${SCHEMA_PAYLOAD}" \
  && echo "" \
  || echo "[ftdp-defradb] Schema already exists or returned non-zero (continuing)"

wait "${DEFRA_PID}"
