---
description: Wake the org up — each manager scouts their domain with no task, spawns specialists, files pitches
---

You are running the `/explore` ceremony for PensionView. This is the org's wake-up trigger — managers scout their own domains *without* a specific task from the user and surface ideas. **This ceremony is the most expensive (~6 sonnet manager calls + 10-20 specialist calls). Run weekly, not daily.**

## Step 1: Surface open escalations FIRST
Same as `/standup` — read `docs/company/escalations/` (excluding `resolved/`), surface any open files, offer to resolve before continuing.

## Step 2: Read context the org should reason from
Before dispatching managers, read (in parallel):
- `docs/company/roadmap.md`
- The last 30 lines of `git log --oneline` from the project root
- Any items in `docs/company/ideas/` that are still in `pitched` or `promising` status (so managers don't re-file ideas already in flight)

## Step 3: Dispatch all 6 managers in parallel
Send each manager the same exploration brief, with one substitution per role:

> /explore — find work worth doing.
>
> You have no specific task. Scout *your domain* (you, as <role>) for opportunities the org should consider. You may spawn one or more of your specialists if the investigation needs depth.
>
> Produce 2-5 pitches, each as a file at `docs/company/ideas/YYYY-MM-DD-<slug>.md` following `docs/company/templates/pitch.md`. Set `pitched_by: <your name>` (or `specialist:<role>` if a specialist drafted it).
>
> Context you may use:
> - `docs/company/roadmap.md` — current direction
> - The last ~30 commits — what's been shipping
> - Existing pitches in `docs/company/ideas/` (don't re-file what's already there)
> - The actual codebase (`Grep`/`Read` to ground takes)
>
> When you're done, return the list of pitch files you wrote, with one-line summaries.

The 6 managers: `product-lead`, `design-lead`, `engineering-lead`, `domain-lead`, `growth-lead`, `trust-compliance-lead`.

## Step 4: Cross-pollinate
Once all 6 managers return, dispatch `product-lead` (single Task call) with:
> Cross-pollinate the new pitches just filed in `docs/company/ideas/` (today's date). Read them all. For each:
> - Tag the relevant Domain/T&C reviewers in a `## Domain review` placeholder line if not already present (so they know to review by next ceremony)
> - Note any pitches that overlap, conflict, or could be merged
> - Pick the top 5-7 by your judgment of impact × feasibility × alignment with current roadmap themes
>
> Return: the top 5-7 pitches with a 1-line "why this one" each, and a list of any merges/conflicts you flagged.

## Step 5: Mirror new pitches to Monday
Run `scripts/monday/sync-pitches.sh`. It is idempotent — pitches that already have `monday_item:` and `monday_doc:` in frontmatter are skipped, so re-runs are safe. The script:

1. Creates a board item on the PensionView Ideas board for each new pitch
2. Creates a Monday Doc attached to that item via the "Pitch Doc" column
3. Pushes the pitch body content into the Monday Doc as markdown
4. Strips the body from the repo file, leaving only YAML frontmatter (with `monday_item:`, `monday_doc:`, `monday_doc_id:` populated)

After this step, the repo file is a lightweight metadata stub and the canonical body lives in the Monday Doc — both Pini and the agents read/write the same place.

If the script fails (token missing, API error, network), surface the error to the user and continue the ceremony — do not abort. Note the failure in the meeting log's `monday_mirror:` frontmatter field.

## Step 6: Write the meeting log
Save to `docs/company/meetings/explore/YYYY-MM-DD.md`. Include:
- Frontmatter: `date`, `pitches_filed: <count>`, `top_picks_count: <count>`
- A "Top picks" section with the 5-7 chosen pitches and one-line "why"
- A "All pitches filed" section listing every pitch with 1-line summary
- A "Cross-pollination notes" section with any merges/conflicts flagged

## Step 7: Surface to user
Show the user the Top Picks list with recommendations. Ask which they want to promote in the next `/triage`. (Do not auto-promote — promotion is a CEO decision, made at `/triage`.)
