#!/usr/bin/env bash
# setup-boards.sh — idempotent Monday workspace + boards setup for PensionView agent org.
# Creates (or finds existing) the PensionView workspace and 5 boards with their columns
# in pinizolberg-company.monday.com. Safe to re-run.
#
# Requires: MONDAY_API_TOKEN_PINIZOLBERG env var, jq, curl.
set -euo pipefail

if [ -z "${MONDAY_API_TOKEN_PINIZOLBERG:-}" ]; then
  echo "ERROR: MONDAY_API_TOKEN_PINIZOLBERG not set. Source ~/.zshrc or set the env var." >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MQ="$SCRIPT_DIR/mq.sh"

call() { "$MQ" "$1"; }

# Sanity-check the token works before doing anything else.
echo "==> Checking Monday API auth..."
ME=$(call 'query { me { id email } }')
if echo "$ME" | jq -e '.errors' >/dev/null 2>&1; then
  echo "ERROR: API call failed:" >&2
  echo "$ME" | jq . >&2
  exit 1
fi
echo "  Authenticated as: $(echo "$ME" | jq -r '.data.me.email')"

# 1. Ensure workspace 'PensionView' exists.
echo "==> Ensuring workspace 'PensionView' exists..."
WORKSPACES=$(call 'query { workspaces { id name } }')
WS_ID=$(echo "$WORKSPACES" | jq -r '.data.workspaces[]? | select(.name=="PensionView") | .id' | head -1)
if [ -z "$WS_ID" ] || [ "$WS_ID" = "null" ]; then
  echo "  Creating workspace 'PensionView'..."
  WS_RES=$(call 'mutation { create_workspace (name: "PensionView", kind: open, description: "PensionView agent org workspace") { id } }')
  if echo "$WS_RES" | jq -e '.errors' >/dev/null 2>&1; then
    echo "ERROR: workspace create failed:" >&2
    echo "$WS_RES" | jq . >&2
    exit 1
  fi
  WS_ID=$(echo "$WS_RES" | jq -r '.data.create_workspace.id')
fi
echo "  Workspace ID: $WS_ID"

# 2. Ensure boards exist.
ensure_board() {
  local NAME="$1"
  local DESC="$2"
  local BOARDS
  BOARDS=$(call "query { boards (workspace_ids: [$WS_ID], limit: 100) { id name } }")
  local ID
  ID=$(echo "$BOARDS" | jq -r ".data.boards[]? | select(.name==\"$NAME\") | .id" | head -1)
  if [ -z "$ID" ] || [ "$ID" = "null" ]; then
    echo "  Creating board '$NAME'..." >&2
    local RES
    RES=$(call "mutation { create_board (board_name: \"$NAME\", board_kind: public, workspace_id: $WS_ID, description: \"$DESC\") { id } }")
    if echo "$RES" | jq -e '.errors' >/dev/null 2>&1; then
      echo "ERROR: board create failed for '$NAME':" >&2
      echo "$RES" | jq . >&2
      exit 1
    fi
    ID=$(echo "$RES" | jq -r '.data.create_board.id')
  fi
  echo "$ID"
}

echo "==> Ensuring boards..."
SPRINT_ID=$(ensure_board "PensionView Sprint" "Current sprint tickets")
IDEAS_ID=$(ensure_board "PensionView Ideas" "Mirror of docs/company/ideas/")
ROADMAP_ID=$(ensure_board "PensionView Roadmap" "Quarter-level themes")
ESCAL_ID=$(ensure_board "PensionView Escalations" "Open CEO escalations")
RETRO_ID=$(ensure_board "PensionView Retros & Decisions" "Retro outcomes + ADR log")

echo "  Sprint:        $SPRINT_ID"
echo "  Ideas:         $IDEAS_ID"
echo "  Roadmap:       $ROADMAP_ID"
echo "  Escalations:   $ESCAL_ID"
echo "  Retros:        $RETRO_ID"

# 3. Add custom columns where the default name+status isn't enough.
ensure_column() {
  local BOARD_ID="$1"
  local TITLE="$2"
  local TYPE="$3"
  local COLS
  COLS=$(call "query { boards (ids: [$BOARD_ID]) { columns { id title type } } }")
  local EXISTS
  EXISTS=$(echo "$COLS" | jq -r ".data.boards[0].columns[]? | select(.title==\"$TITLE\") | .id" | head -1)
  if [ -z "$EXISTS" ] || [ "$EXISTS" = "null" ]; then
    echo "    Adding column '$TITLE' ($TYPE) to board $BOARD_ID..."
    local RES
    RES=$(call "mutation { create_column (board_id: $BOARD_ID, title: \"$TITLE\", column_type: $TYPE) { id } }")
    if echo "$RES" | jq -e '.errors' >/dev/null 2>&1; then
      echo "    WARN: column create returned errors for '$TITLE':" >&2
      echo "$RES" | jq -c '.errors' >&2
    fi
  fi
}

echo "==> Ensuring columns on PensionView Sprint..."
ensure_column "$SPRINT_ID" "Owner" text
ensure_column "$SPRINT_ID" "Type" status
ensure_column "$SPRINT_ID" "Effort" status
ensure_column "$SPRINT_ID" "Linked PR" link
ensure_column "$SPRINT_ID" "Linked pitch" text
ensure_column "$SPRINT_ID" "Domain reviewed?" status
ensure_column "$SPRINT_ID" "Notes" text

echo "==> Ensuring columns on PensionView Ideas..."
ensure_column "$IDEAS_ID" "Source path" text
ensure_column "$IDEAS_ID" "Pitched by" text
ensure_column "$IDEAS_ID" "Size" status
ensure_column "$IDEAS_ID" "Pitch Doc" doc

echo "==> Ensuring columns on PensionView Escalations..."
ensure_column "$ESCAL_ID" "Trigger" status
ensure_column "$ESCAL_ID" "Opened by" text
ensure_column "$ESCAL_ID" "Source path" text

echo "==> Done."
