# PensionView Agent Org — Design

**Date:** 2026-04-20
**Author:** CEO (Claude) + Pini
**Status:** Approved, ready for implementation plan

---

## 1. Context

PensionView is a Next.js 16 / React 19 / Supabase product for the Israeli pension/retirement market: AI advisor, fee analyzer, deposit verification alerts, retirement goal tracker, multi-member family support, with a pipeline that ingests pension PDFs from Gmail. ~25 features shipped, mobile + desktop polished.

Pini wants to "take it to the next level" by building a multi-agent organization that researches, innovates, and ships continuously instead of one ad-hoc task at a time. Pini acts as co-founder; CEO is the Claude session being driven; standing managers and on-demand specialists do the work.

## 2. Goals & non-goals

**Goals**

- Define a real, federated agent org that can run inside this repo with low ceremony.
- Give the org *memory* (decisions, research, pitches survive across sessions).
- Make innovation a first-class flow — anyone can pitch, domain experts have veto, ideas die or graduate cleanly.
- Keep the CEO out of the critical path of routine work; involve only on real escalations.
- Provide a small set of slash-command ceremonies that wake the org up without dictating tasks.

**Non-goals (v1)**

- No autonomous cron / GitHub-Actions / `loop`-driven background runs. Manual rhythm first.
- No multi-product support — this design lives in the pensionview repo only.
- No Slack / Datadog / GitHub-PR integrations. Out of v1.
- No HR/recruiting agent — there are no humans to hire. Agent-ops sits with CEO.

## 3. Architecture decisions

| # | Decision | Rationale |
|---|---|---|
| D1 | Real Claude Code subagents in `.claude/agents/`, not personas or autonomous workers | Version-controlled, callable by name, predictable cost |
| D2 | Layered org: ~6 standing manager subagents + on-demand specialists | Org-chart feel without roster bloat or stale agents |
| D3 | On-demand + lightweight ceremonies (`/standup`, `/explore`, `/triage`, `/sprint`, `/retro`) | Real-company feel without forcing maintained backlog before we know the rhythm |
| D4 | Hybrid memory: Monday for ops (tickets/sprints/OKRs), repo `docs/company/` for memory (decisions/research/RFCs) | Each surface used where it shines; both stay complete |
| D5 | Federated peer-to-peer communication; escalate to CEO only on deadlock / out-of-scope / veto-override / bet-the-company | Pini explicitly rejected hub-and-spoke. CEO must not be a bottleneck. (See `feedback_delegation_over_micromanagement.md`) |
| D6 | Domain Lead and Trust & Compliance Lead hold veto in their domain; veto requires written reasoning; only CEO can override | Protects truth (domain reality, regulatory reality), not opinions |
| D7 | Innovation lane: anyone (managers + specialists) can pitch; domain review is mandatory; survivors graduate via `/triage` | Prevents "good ideas dying in chat" and "pet ideas skipping review" |
| D8 | Specialists are prompt templates spawned via `general-purpose` Task, not file-defined agents | Depth without bloat; new specialists added by dropping a markdown file |

## 4. Roster & roles

Six standing managers + CEO. Filenames in `.claude/agents/` are lowercase-kebab so they're callable by name.

| Agent | Owns | Can spawn (specialists) | Veto |
|---|---|---|---|
| `ceo` (live session) | Direction, prioritization, escalation resolver, agent-ops | — | Final say |
| `product-lead` | Roadmap, PRDs, prioritization, success metrics, `/triage` facilitator | `pm-researcher`, `data-analyst-pm` | — |
| `design-lead` | Visual design, IA, interaction patterns, design system | `ux-researcher`, `visual-designer`, `accessibility-specialist` | — |
| `engineering-lead` | Technical direction, architecture, code quality, ship discipline | `frontend-engineer`, `backend-engineer`, `data-engineer`, `ai-engineer`, `devops-engineer`, `qa-engineer` | — |
| `domain-lead` | Pension/insurance/investment domain truth, Israeli market specifics | `pension-expert`, `insurance-agent`, `investment-expert`, `israeli-tax-expert`, `kupot-gemel-specialist` | **Yes — within domain** |
| `growth-lead` | Acquisition, retention, activation, distribution channels | `marketer`, `seo-specialist`, `content-writer`, `growth-analyst` | — |
| `trust-compliance-lead` | Security (RLS, encryption), Israeli fintech regs, GDPR, brand/trust risk | `security-engineer`, `legal-counsel`, `privacy-officer` | **Yes — within domain** |

**Cross-team calls are normal** — Product can pull `pension-expert` directly, Engineering can pull `accessibility-specialist`. Specialists are spawned by their *parent manager* (so cross-team callers go through the parent manager) — keeps quality control with the function owner.

## 5. Subagent file structure & system prompt anatomy

Two-tier roster: managers are file-defined subagents (persistent, callable by name); specialists are prompt templates spawned on-demand by managers via the `general-purpose` agent type.

```
.claude/agents/
  product-lead.md
  design-lead.md
  engineering-lead.md
  domain-lead.md
  growth-lead.md
  trust-compliance-lead.md

docs/company/specialists/
  pension-expert.md
  israeli-tax-expert.md
  kupot-gemel-specialist.md
  ux-researcher.md
  frontend-engineer.md
  backend-engineer.md
  ai-engineer.md
  security-engineer.md
  legal-counsel.md
  ... (grow over time)
```

**No `ceo.md`.** The CEO is the live session being driven by Pini; making it a subagent creates an awkward "main agent calls itself" loop. Escalations don't call CEO; they write to `docs/company/escalations/` and stop.

**Manager system prompt template (7 fixed sections):**

1. **Identity & domain** — who you are, what product, what authority
2. **What you own** — concrete responsibilities (the table from §4)
3. **Veto status** — explicit `HAS VETO IN DOMAIN: yes/no` line + what veto means
4. **Your colleagues** — directory of other managers with one-line "call when…" notes
5. **Specialists you can spawn** — list of templates in `docs/company/specialists/` that are yours, plus the `Task(subagent_type="general-purpose", prompt=<template>+<task>)` snippet
6. **Escalation triggers** — the 4 conditions (§6), each with example, and the file-write mechanism
7. **Where your work lives** — file paths in `docs/company/` + which Monday board/group

**Tool allocation by manager** (frontmatter `tools:` field):

- All managers: `Read, Grep, Glob, Write, Edit, Task, WebFetch, WebSearch` + Monday MCP tools
- `engineering-lead`, `trust-compliance-lead`: add `Bash` (build, test, audits)
- `domain-lead`: add `Bash` (occasional Supabase queries to ground takes)

**Model defaults:** managers default `sonnet`. Specialists pick per task — research-heavy → `sonnet`, focused well-scoped → `haiku`, gnarly tradeoff calls → `opus`.

**Specialist template anatomy (~40 lines):** Identity → Domain expertise → Output format → Constraints (e.g., `israeli-tax-expert` must cite the relevant חוק/תקנה when making claims).

## 6. Escalation contracts & domain veto

**The 4 escalation triggers** (verbatim in every manager prompt):

1. **Deadlock** — two managers exchanged ≥2 rounds, neither will move
2. **Out-of-scope** — pivot, new market, real money spent, rewrites another team's plan
3. **Veto override** — disagree with a domain or T&C veto, want it overruled
4. **Bet-the-company** — security incident, legal exposure, brand risk, data loss

Anything else: **decide and ship.** CEO sees results, not requests for permission.

**Mechanism — write, don't call:**

```
docs/company/escalations/
  YYYY-MM-DD-<slug>.md     ← open
  resolved/
    YYYY-MM-DD-<slug>.md    ← moved here after CEO rules
```

Each file follows `docs/company/templates/escalation.md`:

```markdown
---
opened: 2026-04-21
opened_by: engineering-lead
trigger: deadlock          # deadlock | out-of-scope | veto-override | bet-the-company
involves: [product-lead]
status: open               # open | resolved | wontfix
---

## The decision
<one sentence>

## Positions
- engineering-lead: <take + reasoning>
- product-lead: <take + reasoning>

## What CEO needs to decide
<crisp question, ideally yes/no or A/B>

## Recommendation
<the escalator's own recommendation, even if biased — useful signal>
```

**How escalations surface to CEO:** every ceremony's first action is `ls docs/company/escalations/`. If anything is open, surface to user before continuing the ceremony. CEO appends `## Resolution` and moves the file to `resolved/`.

**Domain veto:**
- **Held by:** `domain-lead` (pension/insurance/investment/Israeli market truth) and `trust-compliance-lead` (security/regulation/brand-trust)
- **Expressed:** vetoing agent writes `VETO: <reasoning>` into a `## Domain review` section on the originating pitch/PRD/escalation. **No silent vetoes** — reasoning is mandatory.
- **Effect:** work cannot proceed; other managers cannot route around
- **Override:** only via a `veto-override` escalation to CEO. CEO either backs the veto (work dies, logged) or overrides (work proceeds, decision logged in `docs/company/decisions/`)
- **Does not block:** discussion, alternatives, or the same idea reframed to address the concern

**Quiet rule baked into every prompt:** *If you're typing an escalation and finding it hard to articulate why this needs CEO, you probably don't need CEO. Ship and put it in your next standup.*

## 7. Innovation pipeline

**Who can pitch:** any manager, any specialist. Cross-domain pitches welcome (a `frontend-engineer` specialist can pitch a UX gap they noticed).

**Where pitches live:**

```
docs/company/ideas/
  YYYY-MM-DD-<slug>.md     ← open
  shipped/  killed/  parked/
```

Mirrored on Monday "Ideas" board with synced status column.

**Pitch one-pager** (template in `docs/company/templates/pitch.md`):

```markdown
---
pitched: 2026-04-21
pitched_by: domain-lead          # or specialist:pension-expert
status: pitched                  # pitched | in-review | promising | shipped | killed | parked
size: S | M | L
---

## The idea
<one sentence — must fit on a tweet>

## Why it matters
<who benefits, what changes for them, why now>

## How it might work
<2-4 bullets — sketch, not spec>

## What we don't know
<honest list of open questions>

## Domain review
<empty until reviewers fill in — VETO, CONCERNS, or LGTM with reasoning>
```

**Lifecycle:**

1. **Pitched.** Author drops the file. No permission needed.
2. **Domain review (within 48h, enforced by next ceremony).** `product-lead` tags relevant Domain/T&C experts, who write into `## Domain review`: `LGTM`, `CONCERNS: <reasoning>`, or `VETO: <reasoning>`.
3. **Status transitions:**
   - **Any VETO** → `killed`, file → `killed/`. Author may re-pitch a *different* proposal addressing the concern.
   - **All LGTM or CONCERNS only** → `promising`. Goes into next `/triage`.
4. **`/triage`** — `product-lead` walks CEO through `promising` ideas. CEO does one of: **promote** (→ roadmap, queued for `/sprint`), **park** (→ `parked/`, with reason — revisit next quarter), or **kill** (CEO override, → `killed/` with CEO reasoning).
5. **`/sprint`** picks promoted ideas, breaks into Monday tickets, assigns. Pitch stays in `ideas/` until the PR merges, then moves to `shipped/`.

**Killing & reviving:** killed ≠ dead forever. Author can re-pitch with a `## Why now (revived)` section explaining what changed. Parked ideas can be promoted at any `/triage` without re-review.

**Anti-patterns the prompts forbid:**
- No silent vetoes (reasoning mandatory)
- No "manager liked it so it skips review" — domain review is mandatory
- No "we discussed it in chat" — if it's not in `docs/company/ideas/`, it doesn't exist
- No pitches longer than the template

## 8. Memory surfaces

**Rule:** repo for memory, Monday for ops. Repo for what I'd want to read in 6 months when reopening this codebase. Monday for what I'd want to track from my phone or share at a glance.

**Repo: `docs/company/` tree:**

```
docs/company/
  README.md                          ← how the company works (condensed from this spec)
  roadmap.md                         ← current direction, written by product-lead, signed by CEO
  decisions/                         ← one file per CEO decision (ADR-style), dated
    YYYY-MM-DD-<slug>.md
  escalations/                       ← open CEO escalations (§6)
    YYYY-MM-DD-<slug>.md
    resolved/
  ideas/                             ← innovation pipeline (§7)
    YYYY-MM-DD-<slug>.md
    shipped/  killed/  parked/
  prds/                              ← product specs, owned by product-lead
    YYYY-MM-DD-<slug>.md
  research/                          ← per-team research notes
    product/  design/  engineering/  domain/  growth/  trust-compliance/
  meetings/                          ← machine-readable ceremony logs
    standup/YYYY-MM-DD.md
    explore/YYYY-MM-DD.md
    sprint/YYYY-MM-DD.md
    retro/YYYY-MM-DD.md
    triage/YYYY-MM-DD.md
  specialists/                       ← prompt templates spawnable by managers (§5)
    pension-expert.md
    israeli-tax-expert.md  ...
  templates/                         ← canonical templates so agents stay consistent
    pitch.md  prd.md  decision.md  escalation.md  research-note.md
```

**Authority — who writes what:**

| Folder | Writers | Notes |
|---|---|---|
| `roadmap.md` | `product-lead` drafts, `ceo` signs | Single source of truth for direction |
| `decisions/` | `ceo` only | ADR-style, immutable once written |
| `escalations/` | Any manager opens; `ceo` resolves + moves to `resolved/` | |
| `ideas/` | Anyone (managers + specialists) | |
| `prds/` | `product-lead` (with input) | |
| `research/<team>/` | That team's manager + their specialists | |
| `meetings/` | The ceremony slash command writes them | |
| `specialists/`, `templates/` | `ceo` / agent-ops only | Slow-changing, structural |

Everyone reads everything. No secrets between teams.

**Monday workspace structure** (in `pinizolberg-company.monday.com`, workspace **PensionView**):

- **PensionView Sprint** — current sprint board. Items = tickets from `/sprint`. Groups: Backlog · This sprint · In progress · In review · Done. Columns: Owner, Type (Feature/Bug/Refactor/Research), Effort, Linked PR, Linked pitch (repo path), Domain reviewed?, Notes.
- **PensionView Ideas** — mirror of `docs/company/ideas/`. Status column tracks lifecycle. Repo file canonical.
- **PensionView Roadmap** — quarter-level themes. Higher altitude than Sprint.
- **PensionView Escalations** — mirror of open escalations, so they're visible from your phone.
- **PensionView Retros & Decisions** — log of `/retro` outcomes + decisions. Repo canonical.

**The cross-link rule.** Items existing in both surfaces have bidirectional links: pitch in `ideas/` has `monday_item: <url>` frontmatter; Monday item has repo path in a "Source" column. **If they conflict, status wins from Monday, content wins from repo.**

## 9. Ceremonies as slash commands

Five commands. Each is a markdown file in `.claude/commands/<name>.md` — the body is the prompt sent when typed. **Every ceremony's first action is `ls docs/company/escalations/`** — open escalations get surfaced to CEO before anything else.

| Command | When | What it does |
|---|---|---|
| `/standup` | Daily-ish pulse | All 6 managers report focus / landed / blocked / needs-from in parallel; CEO synthesizes; written to `meetings/standup/`. No ideation. |
| `/explore` | Wake the org up | Each manager scouts their own domain with no task from CEO; spawns specialists; writes 2-5 pitches each to `ideas/`; `product-lead` cross-pollinates; CEO sees top 5-7 with recommendations. |
| `/triage` | After ideas pile up | `product-lead` walks CEO through `promising` pitches; CEO promotes/parks/kills each. |
| `/sprint` | Commit to next chunk | Reads roadmap + promoted pitches; `product-lead` proposes scope; CEO cuts/approves; managers break into Monday tickets. |
| `/retro` | After a sprint ships | Reads Sprint board + escalations + decisions; managers reflect; CEO synthesizes 3-5 adjustments — *which can include diffs to manager prompts or specialist templates.* That's how the company evolves. |

**Cost:** `/explore` is the expensive one (~6 sonnet + ~10-20 specialist calls). Run weekly, not daily. `/standup` is cheap; run freely. Per-ceremony model overrides deferred to v2 if cost matters.

**Future graduation (not v1):** any ceremony can become a cron via the `loop` skill or a GitHub Action. Add once manual rhythm is proven.

## 10. v1 build list

Everything needed for the first `/standup` to work:

1. **6 manager subagent files** in `.claude/agents/` following the §5 template.
2. **5 ceremony slash commands** in `.claude/commands/`.
3. **Full `docs/company/` skeleton:**
   - `README.md` (condensed from this spec)
   - All folders from §8, each with `.gitkeep` if empty
   - 5 templates in `templates/` — `pitch.md`, `prd.md`, `decision.md`, `escalation.md`, `research-note.md`
   - Empty `roadmap.md` with starter section
4. **8 starter specialist templates** in `docs/company/specialists/`:
   - Domain: `pension-expert`, `israeli-tax-expert`
   - Design: `ux-researcher`
   - Engineering: `frontend-engineer`, `ai-engineer`
   - Trust & Compliance: `security-engineer`
   - Growth: `growth-analyst`
   - Product: `pm-researcher`
5. **Monday workspace setup** — five boards (Sprint, Ideas, Roadmap, Escalations, Retros & Decisions) created via Monday MCP, with columns from §8. Scripted, not hand-clicked.
6. **Monday token configured** — added to `~/.zshrc` or `.env.local`. Pini does this himself; token is not pasted in chat.

**Smoke test sequence:**
1. `/standup` — validates all 6 managers respond in expected shape; meetings folder gets written.
2. `/explore` — validates the full ideation flow (specialists spawn, pitches created, domain review happens, Monday gets written).
3. Manually inject a fake escalation into `docs/company/escalations/` and run `/standup` again — validates escalation surfacing.

**Explicitly deferred:**
- Cron / GitHub Actions / `loop` automation
- Specialists beyond the starter 8 — added on demand
- Per-ceremony model overrides
- Slack / Datadog / GitHub-PR integrations
- Multi-product support

**v1 done means:**
- `/standup` runs end-to-end without errors
- `/explore` produces real pitches landing in both repo and Monday
- A real escalation can be opened by a manager and resolved by CEO
- One pitch can travel from `ideas/` → `promising` → roadmap → Monday ticket → `shipped/`

## 11. Open questions for the implementation plan

- **Monday MCP wiring for the personal workspace.** Target is `pinizolberg-company.monday.com`. Implementation plan should verify which workspace the existing Monday MCP server points at, then pick one of: (a) add a second MCP server entry pointing at the personal workspace, or (b) call the Monday REST API via `MONDAY_API_TOKEN` env var. Walk through the exact steps so Pini can configure the token without pasting it in chat.
- **Existing slash commands in this repo or globally.** Need to check `.claude/commands/` for collisions with `standup`, `explore`, etc. — if there's a global `/standup`, we may need a project-prefixed name (`/pv:standup`).
- **Where to put `docs/company/`.** Currently the project has no `docs/` folder. Implementation creates it; nothing to merge.
- **Initial roadmap content.** `roadmap.md` needs a starter snapshot — likely derived from the last 25 commits + git log, written by `product-lead` during the first `/explore`. Or written by CEO during the bootstrap ceremony.

## 12. Future work (out of scope)

- Cron-based autonomous `/explore` runs (e.g., Monday morning)
- GitHub Action triggering `/retro` after every sprint-tagged PR merge
- Slack integration: post `/standup` summaries and `/triage` outcomes to a Slack channel
- Multi-product version of this org living in a shared dotfiles plugin
- Cost telemetry per ceremony (track $ spent per `/explore` so we can tune model defaults)
- Agent-improvement loop: `/retro` automatically diffs prompts based on observed failure patterns
