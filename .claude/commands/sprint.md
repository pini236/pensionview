---
description: Commit to the next chunk of work — break promoted pitches into Monday tickets, assign to teams
---

You are running the `/sprint` ceremony for PensionView. This is where promoted pitches and roadmap items become committed work on the Monday Sprint board.

## Step 1: Surface open escalations FIRST
Same as `/standup`.

## Step 2: Gather candidates
Dispatch `product-lead` with:
> /sprint. Read `docs/company/roadmap.md` and find every pitch in `docs/company/ideas/` whose status is `promoted`. Compose a proposed sprint scope: 3-7 items that fit together coherently (theme, dependency order, total effort).
>
> Return:
> - Proposed sprint scope (titles + 1-line each + size S/M/L)
> - Which roadmap themes the sprint advances
> - What you'd cut if forced to drop one

## Step 3: User cuts/approves
Present the proposal to the user. Capture cuts and additions. Lock the final sprint scope.

## Step 4: Break each item into tickets
For each item in the locked scope, dispatch the most relevant manager (Engineering for code; Design for design specs; etc.) with:
> Break this work into Monday tickets for the PensionView Sprint board.
> Item: <title> (size: <S|M|L>)
> Pitch: <repo path>
>
> Produce 1-5 tickets. For each, return:
> - Title
> - Owner (which manager/team)
> - Type (Feature/Bug/Refactor/Research)
> - Effort (S/M/L)
> - Acceptance criteria (3-5 bullets)
> - Linked pitch (repo path)
> - Linked PR (empty until work starts)

## Step 5: Create the Monday tickets
For each ticket the manager returned, create an item on the **PensionView Sprint** board (group: "This sprint"). Set columns: Owner, Type, Effort, Linked PR (empty), Linked pitch (repo path), Domain reviewed? (yes — they were in `promising`/`promoted`), Notes (acceptance criteria).

For each pitch that just had tickets created, write the `monday_item: <ticket-url>` into the pitch frontmatter so the cross-link is bidirectional.

## Step 6: Update the roadmap
Append a new section to `docs/company/roadmap.md`:
```
## Sprint <N> (started YYYY-MM-DD)
- <pitch title> (owner: <manager>) — <linked Monday ticket>
- ...
```

## Step 7: Write the meeting log
Save to `docs/company/meetings/sprint/YYYY-MM-DD.md`. Include the locked scope, the tickets created, and any cuts.

## Step 8: Surface to user
Show the user the committed sprint scope with Monday links. Ask if they want to message any specific manager to start a particular item.
