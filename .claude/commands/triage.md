---
description: Walk through promising pitches with CEO — promote, park, or kill each
---

You are running the `/triage` ceremony for PensionView. This is where pitches that survived domain review get promoted to the roadmap, parked, or killed.

## Step 1: Surface open escalations FIRST
Same as `/standup`.

## Step 2: Gather promising pitches
Dispatch `product-lead` with:
> /triage. Find every pitch in `docs/company/ideas/` whose status is `promising` (i.e., domain review complete with no VETO). For each, read the file's frontmatter for status/metadata; read the body from the Monday Doc using `export_markdown_from_doc(docId: <monday_doc_id>) { success markdown error }` via `scripts/monday/mq.sh` — the repo file body is empty after sync, the canonical body is in Monday. Prepare a 1-paragraph summary with:
> - The idea (1 sentence)
> - Why it matters (1 sentence)
> - Domain review outcome (LGTM / CONCERNS — quote the reasoning from the Monday Doc)
> - Your recommendation: promote / park / kill, with reasoning
>
> Return the list. If there are no `promising` pitches, say so.

## Step 3: Walk the user through them, one by one
For each pitch the `product-lead` returns, present it to the user with the recommendation, and ask: **promote / park / kill?**
- If user wants to know more, read the pitch body from the Monday Doc using `export_markdown_from_doc(docId: <monday_doc_id>)` and surface the relevant section. The repo file is frontmatter-only after sync — the body lives in Monday.
- If user disagrees with `product-lead`'s recommendation, that disagreement is fine — CEO decides. If CEO overrides a domain expert's CONCERNS to promote anyway, log the override in `docs/company/decisions/YYYY-MM-DD-<slug>.md`.

## Step 4: Apply the decisions
For each pitch:
- **Promote** — update status to `promoted` (still in `ideas/`); add an entry under "## Quarter themes" in `docs/company/roadmap.md` if it represents a theme; mirror status update to Monday Ideas board.
- **Park** — update status to `parked`; `git mv` file to `ideas/parked/`; append a "## Why parked" section with reason; mirror to Monday.
- **Kill** — update status to `killed`; `git mv` file to `ideas/killed/`; append a "## Why killed (CEO)" section with reason; mirror to Monday.

## Step 5: Write the meeting log
Save to `docs/company/meetings/triage/YYYY-MM-DD.md`. Include for each pitch: title, recommendation, CEO decision, link to file.

## Step 6: Surface to user
Show the user the summary: N promoted, N parked, N killed. If anything was promoted, suggest running `/sprint` next.
