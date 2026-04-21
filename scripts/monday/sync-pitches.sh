#!/usr/bin/env bash
# sync-pitches.sh — full lifecycle sync for docs/company/ideas/*.md pitches.
# Replaces mirror-pitches.sh. Idempotent: pitches with both monday_item: and
# monday_doc: in frontmatter are skipped.
#
# For each pitch:
#   - If already has monday_item + monday_doc  → skip
#   - If has monday_item but NOT monday_doc    → create Doc, push body, strip body
#   - If has neither                           → create board item, then Doc, push body, strip body
#
# After success: every top-level pitch file has monday_item, monday_doc,
# monday_doc_id in frontmatter and an empty body.
#
# Requires: MONDAY_API_TOKEN_PINIZOLBERG, jq, python3, curl. Run from repo root.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MQ="$REPO_ROOT/scripts/monday/mq.sh"
IDEAS_BOARD_ID=5094997064
WORKSPACE_SLUG="pinizolberg-company"
DOC_COLUMN_ID="doc_mm2mq14k"

# Column IDs on the Ideas board
COL_SOURCE="text_mm2m3kf5"
COL_PITCHED_BY="text_mm2mjeyk"
COL_SIZE="color_mm2mmhhh"
COL_STATUS="color_mm2mvcgf"

# ── helpers ──────────────────────────────────────────────────────────────────

extract_field() {
  local file="$1" field="$2"
  awk -v f="$field" '
    /^---$/ { fm = !fm; next }
    fm && $0 ~ "^"f":" {
      sub("^"f":[[:space:]]*", "")
      sub("[[:space:]]*$", "")
      print; exit
    }
  ' "$file"
}

# Extract the body (everything after closing ---) from a pitch file
extract_body() {
  local file="$1"
  awk '
    /^---$/ { count++; next }
    count >= 2 { print }
  ' "$file"
}

# Extract item_id from a monday URL like
#   https://pinizolberg-company.monday.com/boards/5094997064/pulses/<item_id>
item_id_from_url() {
  echo "$1" | sed 's|.*/pulses/||'
}

# Push markdown content into a Monday Doc via python3 (handles quoting safely).
# Writes content to a temp file to avoid shell arg-length limits.
push_content_to_doc() {
  local doc_id="$1"
  local content="$2"

  # Write content to temp file so python reads it without shell quoting issues
  local tmpfile
  tmpfile=$(mktemp /tmp/pitch-body.XXXXXX)
  printf '%s' "$content" > "$tmpfile"

  python3 - "$doc_id" "$MQ" "$tmpfile" <<'PYEOF'
import sys, subprocess, json, time, os

doc_id   = sys.argv[1]
mq       = sys.argv[2]
tmpfile  = sys.argv[3]

with open(tmpfile) as f:
    content = f.read()
os.unlink(tmpfile)

mutation = (
    'mutation { add_content_to_doc_from_markdown'
    '(docId: ' + doc_id + ', markdown: ' + json.dumps(content) + ')'
    ' { success error } }'
)

max_attempts = 5
for attempt in range(1, max_attempts + 1):
    res = subprocess.run([mq, mutation], capture_output=True, text=True)
    if res.returncode != 0:
        print("ERROR: mq.sh failed:", res.stderr, file=sys.stderr)
        sys.exit(1)

    data = json.loads(res.stdout)
    if 'errors' in data:
        errs = data['errors']
        if errs and errs[0].get('extensions', {}).get('code') == 'COMPLEXITY_BUDGET_EXHAUSTED':
            retry_in = errs[0].get('extensions', {}).get('retry_in_seconds', 30)
            print(f"    rate-limited in content push, waiting {retry_in}s (attempt {attempt}/{max_attempts})...", file=sys.stderr)
            time.sleep(retry_in)
            if attempt >= max_attempts:
                print("ERROR: API errors after retries:", errs, file=sys.stderr)
                sys.exit(1)
            continue
        print("ERROR: API errors:", errs, file=sys.stderr)
        sys.exit(1)

    result = data['data']['add_content_to_doc_from_markdown']
    if not result.get('success'):
        print("ERROR: add_content failed:", result.get('error'), file=sys.stderr)
        sys.exit(1)

    print("ok")
    break
PYEOF
}

# Strip body from file, leaving only frontmatter, and inject monday_doc + monday_doc_id.
strip_body_and_inject_doc() {
  local file="$1"
  local doc_url="$2"
  local doc_id="$3"

  # Extract existing frontmatter lines (between the two ---)
  local fm_content
  fm_content=$(awk '
    /^---$/ { count++; if (count == 1) { next } if (count == 2) { exit } next }
    count == 1 { print }
  ' "$file")

  # Remove any existing monday_doc/monday_doc_id lines from frontmatter
  local clean_fm
  clean_fm=$(echo "$fm_content" | grep -v "^monday_doc:" | grep -v "^monday_doc_id:" || true)

  # Write the new file: frontmatter only
  {
    echo "---"
    echo "$clean_fm"
    echo "monday_doc: $doc_url"
    echo "monday_doc_id: $doc_id"
    echo "---"
  } > "$file"
}

# Create a Monday board item for a pitch (used for new pitches only)
create_board_item() {
  local file="$1"
  local rel_path="${file#$REPO_ROOT/}"

  local pitched_by status size base item_name
  pitched_by=$(extract_field "$file" "pitched_by")
  status=$(extract_field "$file" "status")
  size=$(extract_field "$file" "size")
  base=$(basename "$file" .md)
  item_name="${base#????-??-??-}"

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

  local res item_id url
  res=$("$MQ" "$mutation")
  if echo "$res" | jq -e '.errors' >/dev/null 2>&1; then
    echo "    ERROR: create_item failed" >&2
    echo "$res" | jq . >&2
    return 1
  fi

  item_id=$(echo "$res" | jq -r '.data.create_item.id')
  url="https://${WORKSPACE_SLUG}.monday.com/boards/${IDEAS_BOARD_ID}/pulses/${item_id}"

  # Write monday_item back to frontmatter
  if grep -q "^monday_item:" "$file"; then
    sed -i '' "s|^monday_item:.*|monday_item: $url|" "$file"
  else
    awk -v line="monday_item: $url" '
      BEGIN { fm = 0; inserted = 0 }
      /^---$/ {
        if (fm == 0) { fm = 1; print; next }
        if (fm == 1 && !inserted) { print line; inserted = 1 }
      }
      { print }
    ' "$file" > "$file.tmp" && mv "$file.tmp" "$file"
  fi

  echo "$url"
}

# ── main per-file logic ───────────────────────────────────────────────────────

sync_one() {
  local file="$1"
  local rel_path="${file#$REPO_ROOT/}"

  local monday_item monday_doc
  monday_item=$(extract_field "$file" "monday_item" || true)
  monday_doc=$(extract_field "$file" "monday_doc" || true)

  # Fully synced — skip
  if [ -n "$monday_item" ] && [ -n "$monday_doc" ]; then
    echo "  [skip] $rel_path — already synced"
    return 0
  fi

  # New pitch — create board item first
  if [ -z "$monday_item" ] || [ "$monday_item" = "<url-or-empty-until-mirrored>" ]; then
    echo "  [new]  $rel_path — creating board item..."
    monday_item=$(create_board_item "$file") || return 1
    echo "    item: $monday_item"
  fi

  # Derive item_id from URL
  local item_id
  item_id=$(item_id_from_url "$monday_item")
  if [ -z "$item_id" ]; then
    echo "    ERROR: could not parse item_id from URL: $monday_item" >&2
    return 1
  fi

  # Extract body BEFORE we do anything destructive
  local body
  body=$(extract_body "$file")

  # Create Monday Doc attached to this item via the Pitch Doc column.
  # Retry on COMPLEXITY_BUDGET_EXHAUSTED with backoff.
  # On CellLimitExceededException: an empty doc was already created (from a prior
  # aborted run) — look it up from the column value and reuse it.
  echo "  [doc]  $rel_path — creating Monday Doc..."
  local create_res doc_id doc_url
  local attempt=0 max_attempts=5
  while true; do
    attempt=$((attempt+1))
    create_res=$("$MQ" "mutation { create_doc(location: { board: { item_id: $item_id, column_id: \"$DOC_COLUMN_ID\" } }) { id url } }")

    # Rate limit — back off and retry
    if echo "$create_res" | jq -e '.errors[0].extensions.code == "COMPLEXITY_BUDGET_EXHAUSTED"' >/dev/null 2>&1; then
      local retry_in
      retry_in=$(echo "$create_res" | jq -r '.errors[0].extensions.retry_in_seconds // 30')
      echo "    rate-limited, waiting ${retry_in}s (attempt $attempt/$max_attempts)..."
      sleep "$retry_in"
      if [ "$attempt" -ge "$max_attempts" ]; then
        echo "    ERROR: create_doc still failing after $max_attempts attempts" >&2
        return 1
      fi
      continue
    fi

    # Cell limit: doc already exists in this column from a prior aborted run.
    # Read the existing doc's objectId from the column value, then look up its API id.
    if echo "$create_res" | jq -e '.errors[0].extensions.code == "CellLimitExceededException"' >/dev/null 2>&1; then
      echo "    doc already exists in column — reading existing doc info..."
      local col_res obj_id
      col_res=$("$MQ" "query { boards(ids:[$IDEAS_BOARD_ID]) { items_page(limit:1, query_params:{rules:[{column_id:\"name\", compare_value:[\"$(basename "$file" .md | sed 's/^[0-9-]*-//')\"],operator:contains_text}]}) { items { id column_values(ids:[\"$DOC_COLUMN_ID\"]) { value } } } } }")
      obj_id=$(echo "$col_res" | jq -r '.data.boards[0].items_page.items[0].column_values[0].value // ""' | python3 -c "import sys,json; v=sys.stdin.read().strip(); d=json.loads(v) if v else {}; files=d.get('files',[]); print(files[0]['objectId'] if files else '')" 2>/dev/null || true)

      if [ -z "$obj_id" ]; then
        echo "    ERROR: could not read existing doc objectId from column" >&2
        return 1
      fi

      # Construct URL from objectId (Monday docs URL pattern)
      doc_url="https://${WORKSPACE_SLUG}.monday.com/docs/${obj_id}"

      # Query the docs API to get the id (not objectId) — try by doc URL pattern
      # The create_doc returns an `id` field; for existing docs we use the objectId
      # as the docId for add_content_to_doc_from_markdown (Monday accepts both)
      doc_id="$obj_id"
      echo "    reusing existing doc: obj_id=$obj_id  url=$doc_url"
      break
    fi

    # Any other error
    if echo "$create_res" | jq -e '.errors' >/dev/null 2>&1; then
      echo "    ERROR: create_doc failed" >&2
      echo "$create_res" | jq . >&2
      return 1
    fi
    break
  done

  if [ -z "$doc_id" ]; then
    doc_id=$(echo "$create_res" | jq -r '.data.create_doc.id')
    doc_url=$(echo "$create_res" | jq -r '.data.create_doc.url')
  fi
  echo "    doc_id=$doc_id  url=$doc_url"

  # Push body content into the Doc
  echo "  [push] $rel_path — pushing body content..."
  if [ -n "$body" ]; then
    local push_res
    push_res=$(push_content_to_doc "$doc_id" "$body") || {
      echo "    ERROR: push_content_to_doc failed" >&2
      return 1
    }
  else
    echo "    (body is empty, skipping content push)"
  fi

  # Only strip the repo body AFTER successful doc creation + content push
  echo "  [trim] $rel_path — stripping body from repo file..."
  strip_body_and_inject_doc "$file" "$doc_url" "$doc_id"

  echo "  [ok]   $rel_path → doc $doc_id ($doc_url)"
  return 0
}

# ── entry point ───────────────────────────────────────────────────────────────

main() {
  if [ -z "${MONDAY_API_TOKEN_PINIZOLBERG:-}" ]; then
    echo "ERROR: MONDAY_API_TOKEN_PINIZOLBERG not set." >&2
    exit 1
  fi

  local target_dir="${1:-$REPO_ROOT/docs/company/ideas}"
  echo "==> Syncing pitches in $target_dir → Monday board $IDEAS_BOARD_ID"

  shopt -s nullglob
  local files=("$target_dir"/*.md)
  if [ ${#files[@]} -eq 0 ]; then
    echo "  (no pitch files found)"
    exit 0
  fi

  local ok=0 skipped=0 fail=0
  local failures=()

  for f in "${files[@]}"; do
    # Check before running — if already fully synced, sync_one will print [skip]
    local pre_item pre_doc
    pre_item=$(extract_field "$f" "monday_item" || true)
    pre_doc=$(extract_field "$f" "monday_doc" || true)
    local was_already_done=0
    if [ -n "$pre_item" ] && [ -n "$pre_doc" ]; then
      was_already_done=1
    fi

    if sync_one "$f"; then
      if [ "$was_already_done" = "1" ]; then
        skipped=$((skipped+1))
      else
        ok=$((ok+1))
        # Brief pause after each successful sync to stay within Monday API rate limits
        sleep 3
      fi
    else
      fail=$((fail+1))
      failures+=("$(basename "$f")")
      # On rate limit errors, wait longer before continuing
      sleep 5
    fi
  done

  echo ""
  echo "==> Done. $ok synced, $skipped skipped (already done), $fail failed."
  if [ ${#failures[@]} -gt 0 ]; then
    echo "==> FAILURES:"
    for f in "${failures[@]}"; do
      echo "    - $f"
    done
    exit 1
  fi
}

main "$@"
