# PensionView — Company Operating Manual

This folder holds the *non-code* memory of the PensionView agent organization. The full design lives in [`../superpowers/specs/2026-04-20-pensionview-agent-org-design.md`](../superpowers/specs/2026-04-20-pensionview-agent-org-design.md). This file is the day-to-day operating reference.

## How the company is organized

Six standing managers + on-demand specialists + CEO (the live Claude session driven by Pini).

| Agent | Role | Veto |
|---|---|---|
| `product-lead` | Roadmap, PRDs, prioritization, /triage facilitator | — |
| `design-lead` | Visual + UX, design system | — |
| `engineering-lead` | Architecture, code quality, ship discipline | — |
| `domain-lead` | Pension/insurance/investment truth, Israeli market | **Yes — within domain** |
| `growth-lead` | Acquisition, retention, distribution | — |
| `trust-compliance-lead` | Security, regulation, brand-trust | **Yes — within domain** |

Specialists are prompt templates in `specialists/`, spawned on-demand by their parent manager via Task with `subagent_type="general-purpose"`.

## How decisions get made

**Default: agents call agents.** Managers communicate peer-to-peer via Task. CEO is *not* in the critical path of routine work.

**Escalate to CEO only when:**
1. **Deadlock** — two agents disagree, ≥2 rounds, neither will move
2. **Out-of-scope** — pivot, new market, real money, rewrites another team's plan
3. **Veto override** — disagree with a domain or T&C veto, want it overruled
4. **Bet-the-company** — security incident, legal exposure, brand risk

To escalate: write a file to `escalations/YYYY-MM-DD-<slug>.md` following `templates/escalation.md` and stop. CEO surfaces it on the next ceremony.

**Domain veto.** `domain-lead` and `trust-compliance-lead` can VETO any pitch/PRD in their domain by writing `VETO: <reasoning>` into the `## Domain review` section. No silent vetoes — reasoning is mandatory. Override only via `veto-override` escalation.

## Innovation pipeline

Anyone (manager or specialist) can pitch. File goes in `ideas/<date>-<slug>.md` per `templates/pitch.md`. Lifecycle:

1. **Pitched** → file dropped, no permission needed
2. **Domain review (within 48h)** → relevant Domain/T&C experts write LGTM / CONCERNS / VETO
3. **Promising** → all reviews are LGTM or CONCERNS only → goes into next `/triage`
4. **Killed** → any VETO → file moves to `ideas/killed/`. Author can re-pitch a different proposal addressing the concern.
5. **Promoted** → CEO promotes at `/triage` → roadmap → next `/sprint`
6. **Shipped** → PR merges → file moves to `ideas/shipped/`

## Where things live

| Folder | What lives here | Who writes |
|---|---|---|
| `roadmap.md` | Current direction | `product-lead` drafts, `ceo` signs |
| `decisions/` | CEO decisions (ADR) | `ceo` only |
| `escalations/` | Open CEO asks | Any manager opens, `ceo` resolves |
| `ideas/` | Innovation pitches | Anyone |
| `prds/` | Product specs | `product-lead` |
| `research/<team>/` | Per-team research | That team's manager + specialists |
| `meetings/` | Ceremony logs | The slash command writes them |
| `specialists/` | Spawnable templates | `ceo` / agent-ops |
| `templates/` | Canonical artifact templates | `ceo` / agent-ops |

## Ceremonies (slash commands)

| Command | When | Output |
|---|---|---|
| `/standup` | Daily-ish pulse | `meetings/standup/<date>.md` |
| `/explore` | Wake the org up to find work | New pitches in `ideas/`, mirrored to Monday |
| `/triage` | After ideas pile up | Status updates + decisions if CEO overrides |
| `/sprint` | Commit to next chunk | Monday tickets on Sprint board |
| `/retro` | After a sprint ships | `meetings/retro/<date>.md`, possibly diffs to manager prompts |

Every ceremony's first action is `ls escalations/`. Open escalations get surfaced before anything else.

## Monday workspace

`pinizolberg-company.monday.com`, workspace **PensionView**. Boards: Sprint, Ideas, Roadmap, Escalations, Retros & Decisions. Repo is canonical for *content*; Monday is canonical for *status*. Items existing in both surfaces have bidirectional links.
