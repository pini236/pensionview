---
description: Run a daily standup — all 6 managers report focus/landed/blocked/needs-from in parallel
---

You are running the `/standup` ceremony for PensionView. This is the lightest weekly cadence — pulse only, no new ideation.

## Step 1: Surface open escalations FIRST
Read the contents of `docs/company/escalations/` (excluding `resolved/`). If any open escalation files exist, present them to the user *before doing anything else* and ask if they want to resolve before continuing the standup. If they say resolve, walk through each open escalation, capture the user's resolution, append a `## Resolution` section, and `git mv` the file to `docs/company/escalations/resolved/`.

## Step 2: Dispatch all 6 managers in parallel
Use the Task tool to invoke each of these subagents in a single message (parallel execution):
- `product-lead`
- `design-lead`
- `engineering-lead`
- `domain-lead`
- `growth-lead`
- `trust-compliance-lead`

Send each the same prompt:
> Standup. Report in exactly 4 lines, no more:
> - **Focus today:** <what you're working on or thinking about>
> - **Landed since last standup:** <pitches filed, decisions made, work shipped — concrete>
> - **Blocked on / by:** <whom and what, or "nothing">
> - **Needs from another team:** <whom and what, or "nothing">
>
> Do NOT pitch new ideas. Do NOT explore. This is a pulse only.
> If you have nothing material to report, say so in one line.

## Step 3: Synthesize
Compose a one-screen summary with these sections:
1. **Focus this week** — a 1-sentence rollup
2. **Recent wins** — bullets from "landed"
3. **Blockers** — explicit "X is blocked by Y" lines, especially cross-team
4. **Cross-team asks** — "X needs Y from Z" lines
5. **No-news teams** — list of teams with nothing material

## Step 4: Write the meeting log
Save to `docs/company/meetings/standup/YYYY-MM-DD.md` (use today's date). Include:
- Frontmatter: `date`, `attendees: [all 6 managers]`, `escalations_resolved: <count>`
- The synthesis from Step 3
- A `## Raw reports` section with each manager's verbatim 4-line report

## Step 5: Surface to user
Show the user the synthesis (not the raw reports — they can read those in the file). Ask if they want to act on any cross-team ask or blocker before ending the ceremony.
