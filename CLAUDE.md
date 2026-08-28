# Agent Factory

Plain-language business request → a built, tested, deployed chat agent. No engineer on either side.

Full context lives in four planning docs in this repo's `docs/` folder — read the relevant one before making architectural calls, don't guess at something it already answered:
- `Agent-Factory-Business-Case.docx` (BRD) — why this is worth building, risks, target users
- `Agent-Factory-Product-Requirements.docx` (PRD) — what the product does, functional/non-functional requirements
- `Agent-Factory-MVP-Scope.docx` — what ships first, definition of done
- `Agent-Factory-Blueprint.docx` — how it's architected: spec schema, registry contract, Milestone 1 scope

@AGENTS.md

## Current focus

Live task tracker: `MVP-ROADMAP.md`. Check items off there as they're done — it's the source of truth for what's next, ahead of anything stated here.

**Milestone 1** (Blueprint §07): the Spec schema + Intake stage, working in isolation. No Build, Assemble, Test, or Deploy yet — not even stubbed. Done when a fixed set of real-shaped requests each produce a schema-valid Spec, resolved through the registry, with clarifying questions firing only for fields Intake genuinely can't resolve.

Don't build ahead of the current milestone. Voice/email/automation agent types, cross-channel agents, marketplace connectors, team accounts, billing, and analytics are explicitly out of scope until later phases (PRD §05, MVP §02) — don't add scaffolding for them "while we're in there."

## Stack

- **Language:** TypeScript everywhere — Next.js (App Router) for both the requester-facing frontend and the pipeline's API routes. One language, one deploy target, no cross-service auth/CORS to manage between a separate backend and frontend.
- **Database:** Postgres via Supabase, `pgvector` enabled. One service covers relational state (Spec, build artifacts, test results, deploy config), the vector index Assemble needs per agent, auth, and file storage.
- **LLM:** Claude API for every call in the pipeline — Intake parsing, Build generation, Test grading and adversarial checks. Decided in PRD §06 / Blueprint §06, not open for reconsideration without a reason.
- **Validation:** zod, at every stage boundary. This is the literal implementation of Blueprint §04's "schema-validated handoffs only, never free text" — a stage that skips validating its input or output is a bug, not a shortcut.
- **Hosting:** Vercel, by default. Not locked in — revisit if a pipeline run needs longer than serverless limits allow.
- **Package manager:** npm. (pnpm caused real friction on Windows on a prior project here — strict "ignored builds" checks blocking scripts, compounded by an SSL cert issue — not worth re-hitting.)

## Why serverless shapes the pipeline

Vercel functions have execution time limits; a 5-stage pipeline with retries can't run as one long call. This isn't a workaround bolted on top — it matches the architecture that already exists: each stage (Intake / Build / Assemble / Test / Deploy) is its own invocation, reading the prior stage's persisted state from Postgres and writing its own. Pipeline position is state in the database (Blueprint §04's state list), never something held in memory across a request.

## Architecture non-negotiables (from the Blueprint)

- **Registry, not branching.** No stage's code ever contains `if agent_type === 'chat'`. Type-specific behavior goes through an adapter (`lib/pipeline/adapters/<type>/`) resolved via the registry. Milestone 1 registers exactly one type, but goes through the registry from day one — see Blueprint §03.
- **The Spec is the only handoff.** Every stage reads the previous stage's schema-validated output — never the requester's original free text, never another stage's internals (Blueprint §02).
- **Nothing invented.** Build selects tools from the connector library against `required_tools`; it never generates integration code per request (PRD §03).

## Proposed structure

Starting point — expected to shift once Milestone 1 is actually being built:

```
/app
  /api/{intake,build,assemble,test,deploy}   one route per stage
  /(requester)                               submit request, clarifying Qs, pass/fail review, try-the-agent
/lib
  /pipeline/types        Spec schema (zod) + per-stage input/output types
  /pipeline/registry.ts
  /pipeline/adapters/chat
  /db                    Supabase client + queries
  /llm                   Claude API wrapper
/supabase/migrations
/docs                    the 4 planning docs
```

## Working in this repo

1. Read the relevant planning doc section before touching architecture — don't re-derive something the Blueprint already decided.
2. State the plan before writing code: what, which files, which stage(s), how it's tested.
3. When ambiguous, prefer: the registry pattern over a one-off special case, a reversible choice over an irreversible one, flagging an open question over silently deciding it.
4. gstack skills are installed and available — `/office-hours` before scoping something new, `/plan-eng-review` or `/autoplan` before a non-trivial build, `/review` before landing changes, `/ship` to open a PR, `/investigate` for bugs, `/run` to launch and check the app in-browser.
5. No dates or timestamps in code, comments, docs, or commit messages — use semantic version/milestone labels instead.

## Open questions (unresolved — don't silently pick an answer for these)

- Pricing model (PRD §07)
- Whether a requester can hand-edit the generated system prompt directly, or only by redescribing intent (PRD §07)
- Rebuild/retry limits beyond the 2–3 build-retry cap (PRD §07)
- Connector library priority order (PRD §07)
- Spec schema field-level validation rules, hosting choice, how `needs_review` reaches a human (Blueprint §08)
