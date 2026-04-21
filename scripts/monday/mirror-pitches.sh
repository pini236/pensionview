#!/usr/bin/env bash
# mirror-pitches.sh — mirror docs/company/ideas/*.md pitches to the
# PensionView Ideas board on Monday. Idempotent: if a pitch already has
# a `monday_item:` URL in its frontmatter, the script skips creating a
# duplicate item (but does not back-fill if the item was deleted on
# Monday — re-create by clearing the line first).
#
# For each pitch file the script parses the YAML frontmatter for:
#   pitched_by, status, size
# and creates an item with:
#   Name           = filename (without date prefix and .md)
#   Source path    = repo-relative pitch path
#   Pitched by     = pitched_by
#   Size           = size (status, label auto-created)
#   Status         = status (status, label auto-created)
#
# Then writes `monday_item: <url>` back into the pitch frontmatter.
#
# Requires: MONDAY_API_TOKEN_PINIZOLBERG, jq, curl. Run from repo root.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MQ="$REPO_ROOT/scripts/monday/mq.sh"
IDEAS_BOARD_ID=5094997064
WORKSPACE_SLUG="pinizolberg-company"

# Column IDs on the Ideas board (from `query { boards(ids:[ID]) { columns { id title }}}`)
COL_SOURCE="text_mm2m3kf5"   # Source path
COL_PITCHED_BY="text_mm2mjeyk" # Pitched by
COL_SIZE="color_mm2mmhhh"    # Size (status)
COL_STATUS="color_mm2mvcgf"  # Status (status)

extract_frontmatter_field() {
  local file="$1"
  local field="$2"
  awk -v f="$field" '
    /^---$/ { fm = !fm; next }
    fm && $0 ~ "^"f":" {
      sub("^"f":[[:space:]]*", "")
      sub("[[:space:]]*$", "")
      print
      exit
    }
  ' "$file"
}

mirror_one() {
  local file="$1"
  local rel_path="${file#$REPO_ROOT/}"

  local existing
  existing=$(extract_frontmatter_field "$file" "monday_item" || true)
  if [ -n "$existing" ] && [ "$existing" != "<url-or-empty-until-mirrored>" ]; then
    echo "  [skip] $rel_path — already mirrored: $existing"
    return 0
  fi

  local pitched_by status size
  pitched_by=$(extract_frontmatter_field "$file" "pitched_by")
  status=$(extract_frontmatter_field "$file" "status")
  size=$(extract_frontmatter_field "$file" "size")

  # Item name: strip date prefix and .md, keep slug
  local base
  base=$(basename "$file" .md)
  local item_name="${base#????-??-??-}"

  # Build column_values JSON. Use jq to escape safely.
  local cv
  cv=$(jq -nc \
    --arg src "$rel_path" \
    --arg by "$pitched_by" \
    --arg size "$size" \
    --arg status "$status" \
    --arg c_src "$COL_SOURCE" \
    --arg c_by "$COL_PITCHED_BY" \
    --arg c_size "$COL_SIZE" \
    --arg c_status "$COL_STATUS" \
    '{($c_src): $src, ($c_by): $by, ($c_size): {label: $size}, ($c_status): {label: $status}}')

  local mutation
  mutation=$(jq -nc \
    --arg name "$item_name" \
    --arg cv "$cv" \
    --argjson board "$IDEAS_BOARD_ID" \
    '"mutation { create_item (board_id: \($board), item_name: \"\($name)\", column_values: \(($cv | tojson)), create_labels_if_missing: true) { id } }"' \
    | jq -r .)

  local res
  res=$("$MQ" "$mutation")
  if echo "$res" | jq -e '.errors' >/dev/null 2>&1; then
    echo "  [FAIL] $rel_path:" >&2
    echo "$res" | jq . >&2
    return 1
  fi

  local item_id
  item_id=$(echo "$res" | jq -r '.data.create_item.id')
  local url="https://${WORKSPACE_SLUG}.monday.com/boards/${IDEAS_BOARD_ID}/pulses/${item_id}"

  # Write monday_item back to frontmatter (replace placeholder line if present, otherwise insert).
  if grep -q "^monday_item:" "$file"; then
    # macOS sed compatible
    sed -i '' "s|^monday_item:.*|monday_item: $url|" "$file"
  else
    # Insert after the second --- (closing the frontmatter)
    awk -v line="monday_item: $url" '
      BEGIN { fm = 0; inserted = 0 }
      /^---$/ {
        if (fm == 0) { fm = 1; print; next }
        if (fm == 1 && !inserted) { print line; inserted = 1 }
      }
      { print }
    ' "$file" > "$file.tmp" && mv "$file.tmp" "$file"
  fi

  echo "  [ok]   $rel_path → $url"
}

main() {
  if [ -z "${MONDAY_API_TOKEN_PINIZOLBERG:-}" ]; then
    echo "ERROR: MONDAY_API_TOKEN_PINIZOLBERG not set." >&2
    exit 1
  fi

  local target_dir="${1:-$REPO_ROOT/docs/company/ideas}"
  echo "==> Mirroring pitches in $target_dir → Monday board $IDEAS_BOARD_ID"

  shopt -s nullglob
  local files=("$target_dir"/*.md)
  if [ ${#files[@]} -eq 0 ]; then
    echo "  (no pitch files found)"
    exit 0
  fi

  local ok=0 fail=0 skip=0
  for f in "${files[@]}"; do
    if mirror_one "$f"; then
      if grep -q "already mirrored" <<<""; then :; fi
      ok=$((ok+1))
    else
      fail=$((fail+1))
    fi
  done

  echo "==> Done. $ok processed, $fail failed."
}

main "$@"
