#!/usr/bin/env bash
# mq.sh — Monday GraphQL helper.
# Reads a GraphQL query from stdin or argument, posts to Monday API, prints JSON response.
# Requires: MONDAY_API_TOKEN_PINIZOLBERG env var, jq, curl.
#
# Usage:
#   ./mq.sh 'query { me { id email } }'
#   echo 'query { me { id email } }' | ./mq.sh
set -euo pipefail

if [ -z "${MONDAY_API_TOKEN_PINIZOLBERG:-}" ]; then
  echo "ERROR: MONDAY_API_TOKEN_PINIZOLBERG not set. See docs/company/decisions/2026-04-21-monday-wiring.md" >&2
  exit 1
fi

if [ $# -ge 1 ]; then
  QUERY="$1"
else
  QUERY=$(cat)
fi

curl -sS -X POST "https://api.monday.com/v2" \
  -H "Authorization: $MONDAY_API_TOKEN_PINIZOLBERG" \
  -H "Content-Type: application/json" \
  -d "$(jq -nc --arg q "$QUERY" '{query: $q}')"
