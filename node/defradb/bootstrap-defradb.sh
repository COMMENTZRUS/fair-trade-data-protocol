#!/usr/bin/env bash
set -euo pipefail

DEFRADB_URL="${DEFRADB_URL:-http://127.0.0.1:9181}"
IDENTITY="${FTDP_OPERATOR_IDENTITY:-ftdp-operator}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "Checking defradb.rs health at ${DEFRADB_URL}..."
curl -sf "${DEFRADB_URL}/health-check"
echo ""

echo "Registering FTDP Anon Record Zanzibar ACP policy..."
ANON_OUT=$(defradb client acp document policy add \
  --url "${DEFRADB_URL}" \
  -f "${SCRIPT_DIR}/policies/ftdp-anon-policy.yml" \
  --identity "${IDENTITY}")
echo "${ANON_OUT}"
ANON_POLICY_ID=$(echo "${ANON_OUT}" | grep -Eo '[0-9a-f]{64}' | head -n1 || true)

echo "Registering FTDP PII Vault Zanzibar ACP policy..."
PII_OUT=$(defradb client acp document policy add \
  --url "${DEFRADB_URL}" \
  -f "${SCRIPT_DIR}/policies/ftdp-pii-policy.yml" \
  --identity "${IDENTITY}")
echo "${PII_OUT}"
PII_POLICY_ID=$(echo "${PII_OUT}" | grep -Eo '[0-9a-f]{64}' | head -n1 || true)

if [[ -z "${ANON_POLICY_ID}" || -z "${PII_POLICY_ID}" ]]; then
  echo "Warning: Could not auto-extract policy IDs. Set ANON_POLICY_ID and PII_POLICY_ID manually."
  exit 1
fi

TMP_SCHEMA="$(mktemp)"
sed -e "s/<ANON_POLICY_ID>/${ANON_POLICY_ID}/g" \
    -e "s/<PII_POLICY_ID>/${PII_POLICY_ID}/g" \
    "${SCRIPT_DIR}/schemas/ftdp-v1.graphql" > "${TMP_SCHEMA}"

echo "Applying FTDP v1 GraphQL schema..."
defradb client schema add --url "${DEFRADB_URL}" --filepath "${TMP_SCHEMA}" --identity "${IDENTITY}"
rm -f "${TMP_SCHEMA}"

echo "Done! Export these in your ftdp-node environment:"
echo "  DEFRADB_ANON_POLICY_ID=${ANON_POLICY_ID}"
echo "  DEFRADB_PII_POLICY_ID=${PII_POLICY_ID}"
