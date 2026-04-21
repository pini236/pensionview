---
description: Inspect & adapt — reflect on what shipped, what stalled, and update agent prompts if needed
---

You are running the `/retro` ceremony for PensionView. Run after a sprint ships (or any meaningful chunk of work). This is where the company learns and the org *itself* evolves.

## Step 1: Surface open escalations FIRST
Same as `/standup`.

## Step 2: Gather the data
Read in parallel:
- The latest entry under `docs/company/meetings/sprint/` (the sprint we're retroing)
- `git log --oneline` since that sprint started (what actually landed)
- `docs/company/decisions/` filtered to the sprint window (CEO decisions)
- `docs/company/escalations/resolved/` filtered to the sprint window
- The PensionView Sprint board (what's still open vs done)

## Step 3: Dispatch all 6 managers in parallel
Send each:
> /retro for sprint <N>. Reflect on:
> - What worked well in your team's contribution
> - What didn't work (slow, friction, surprises)
> - What you'd change for next time — be specific, point to a tool/prompt/process
>
> If your reflection includes "my own system prompt should change to do X better next time", say so explicitly — that diff lands in `.claude/agents/<your-name>.md`.
>
> 5-10 lines max per section.

## Step 4: Synthesize
Compose 3-5 concrete adjustments for next time. These can be:
- Process changes (run `/explore` more often / less often / pair `/triage` with `/sprint`)
- Org changes (add a specialist template; retire one)
- Prompt diffs (literal text changes to a manager's `.claude/agents/<name>.md` or a specialist template)

## Step 5: Apply prompt diffs (CEO authority)
For any agreed prompt diff:
- Edit the manager file or specialist template directly
- Stage it for commit
- Note in the meeting log which file(s) changed

## Step 6: Write the meeting log
Save to `docs/company/meetings/retro/YYYY-MM-DD.md`. Include:
- What shipped vs what was scoped
- Each manager's reflection (4 short sections)
- The 3-5 adjustments
- Any prompt diffs applied (file + 1-line summary)

## Step 7: Surface to user
Show the user the 3-5 adjustments with a 1-line rationale each, and any prompt diffs that just landed. Ask if they want to roll into a fresh `/explore` or `/sprint` immediately.
