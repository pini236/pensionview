---
date: 2026-04-21
decided_by: ceo
status: active
supersedes:
---

## Context
PensionView agent org needs to read/write Monday boards in Pini's personal workspace at `https://pinizolberg-company.monday.com/`. The existing Monday MCP server wired into Claude Code points at the **corporate monday.com account** (`pinizo@monday.com`) — it is the `monday-api` server from the `agent-standard-mcps` plugin (agentic-builders-hub), connecting to `https://mcp.monday.com/mcp` via OAuth2. The plugin manifest has no workspace-config parameter; workspace is determined entirely by whichever account completes the OAuth2 flow. The global `~/.claude.json` `mcpServers` block has no monday entry at all — the server is plugin-managed, which means there is no clean mechanism to register a second instance pointing at the personal workspace without either re-authenticating and evicting the corporate session or forking the plugin.

## Options considered
- **(A) Second MCP server entry** pointing at pinizolberg-company — would require either re-running the OAuth2 flow (clobbering the corporate session) or adding a raw `mcpServers` entry in global config that shares the same `mcp.monday.com/mcp` endpoint and thus the same OAuth session; the plugin offers no per-instance workspace override, and Claude Code has no supported multi-session mechanism for the same OAuth2 MCP URL.
- **(B) REST/GraphQL API via `MONDAY_API_TOKEN_PINIZOLBERG` env var** — zero MCP config changes; managers call Monday's standard GraphQL endpoint (`https://api.monday.com/v2`) directly via Bash `curl`, authenticated with a personal API token that is already scoped to the `pinizolberg-company` workspace by construction.

## Decision
Picked option **(B)** because the existing Monday MCP server authenticates via OAuth2 to the corporate workspace and the plugin provides no mechanism to target a second workspace concurrently. Adding a second `mcpServers` entry with the same `mcp.monday.com/mcp` URL would share the same OAuth session and still hit the corporate workspace. The REST/GraphQL approach is workspace-agnostic by design: Monday personal API tokens are scoped to the issuing workspace, so a token minted from `pinizolberg-company.monday.com` will always reach that workspace without any MCP reconfiguration. This also keeps the PensionView agent org's Monday wiring independent of Pini's corporate Claude Code setup.

## Consequences
- Managers writing to Monday will use `curl` against `https://api.monday.com/v2` with `Authorization: $MONDAY_API_TOKEN_PINIZOLBERG` and a GraphQL body. A thin Bash helper `scripts/monday/mq.sh` (Monday Query) is worth building for ergonomic GraphQL calls — see Open questions.
- Pini will configure `MONDAY_API_TOKEN_PINIZOLBERG` as an env var in the next task (Task 18), minting the token from the personal workspace settings.
- All existing Monday writes in slash commands (`/explore`, `/sprint`, `/triage`) remain abstract — they reference Monday boards conceptually; the REST wiring is the implementation detail hidden behind `mq.sh`.
- The existing `mcp__plugin_agent-standard-mcps_monday-api__*` tools remain available for corporate monday.com use in other Claude Code sessions; this decision does not affect them.

## Open questions
- **`scripts/monday/mq.sh`**: A minimal wrapper that accepts a GraphQL query string and prints the JSON response would reduce boilerplate in every manager call. Should be built in Task 19 alongside the board-setup script.
