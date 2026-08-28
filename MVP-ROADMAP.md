# MVP Roadmap

Ordered build plan from an empty Next.js app to a complete MVP (MVP Scope §03 Definition of Done, all 5 items met on real requests).

Maps directly onto the Blueprint's 5-stage pipeline (Intake → Build → Assemble → Test → Deploy) — Milestone 1 is defined in Blueprint §07; Milestones 2–7 extend the same numbering, one per remaining stage plus the frontend and launch. This is a different "Milestone N" than the PRD/MVP's own "Phase 1" — Phase 1 (voice) only starts after every milestone here is done.

Check items off as we go. Re-order or split a milestone if reality disagrees with the plan — this file should track what's actually true, not what we guessed at the start.

## Setup — project scaffolding

- [x] Initialize Next.js (App Router, TypeScript) in the repo
- [ ] Create the Supabase project; enable the `pgvector` extension — blocked on you (supabase.com)
- [ ] Wire the Supabase client (`lib/db`) + environment variables (`.env.local`, gitignored) — client code is written, waiting on real project credentials to actually test the connection
- [x] Wire the Claude API client wrapper (`lib/llm`)
- [x] Add zod as the validation layer
- [x] Confirm `npm run dev` runs a blank app locally

## Milestone 1 — Spec schema + Intake (Blueprint §07)

- [ ] Write the Spec zod schema (`lib/pipeline/types`) — every field from Blueprint §02
- [ ] Create the `specs`/`agents` tables in Supabase (migration), including `schema_version`
- [ ] Build the registry module (`lib/pipeline/registry.ts`)
- [ ] Build the chat `IntakeAdapter` (question set + required fields for the chat type)
- [ ] Build the Intake stage: free-text request → Claude API → validated Spec
- [ ] Implement clarifying-question logic — fires only for fields Intake genuinely can't resolve
- [ ] Minimal UI: request form + clarifying-question follow-up
- [ ] Run a fixed set of real-shaped test requests; confirm each produces a schema-valid Spec
- [ ] Milestone 1 demo: request in → Spec out, nothing downstream wired yet

## Milestone 2 — Build

- [ ] Build the chat `BuildAdapter` (prompt template + valid tool subset)
- [ ] Persona/system-prompt generation from the Spec (Claude API call)
- [ ] Define connector/tool library v0 — small fixed set (FAQ lookup, one booking-style action, escalation)
- [ ] Tool-selection logic against `required_tools` — selects, never invents integration code
- [ ] Persist build artifacts (prompt, tool bindings) to Postgres
- [ ] Build stage wired as its own invocation: reads the Spec, writes agent config

## Milestone 3 — Assemble

- [ ] Knowledge-source ingestion (docs/URLs) → chunk + embed
- [ ] Write embeddings to `pgvector`, scoped per `agent_id`
- [ ] Chat `AssembleAdapter` (only if chat needs type-specific ingestion handling)
- [ ] Assemble stage wired as its own invocation

## Milestone 4 — Test

- [ ] Success-criteria test runner — per-criterion pass/fail + full transcript, not a score
- [ ] Baseline adversarial check set (prompt-injection attempts, off-topic refusal)
- [ ] Chat `TestAdapter` (type-specific checks layered on top of the baseline)
- [ ] Structured-gap object on failure, sent back to Build
- [ ] Retry loop capped at 2–3, then agent state moves to `needs_review`
- [ ] Persist test results + transcripts

## Milestone 5 — Deploy

- [ ] Chat `DeployAdapter` (provisions a chat widget + API endpoint)
- [ ] Embeddable chat widget that talks to the deployed agent
- [ ] "Try it yourself" mode before the agent reaches real customers
- [ ] Promote-to-live action (agent state → `deployed`)
- [ ] Deploy stage wired as its own invocation

## Milestone 6 — Requester frontend, full flow

- [ ] Submit-request page
- [ ] Clarifying-questions page
- [ ] Build-status view (polling or Supabase Realtime)
- [ ] Pass/fail results + transcript review page
- [ ] Try-the-agent chat interface
- [ ] Go-live action
- [ ] Supabase Auth wired in — just enough for a requester to own and return to their agent
- [ ] Data scoping enforced (RLS): one business's Spec/knowledge is never visible to another

## Milestone 7 — MVP validation & launch

- [ ] Full pipeline run end-to-end on real (non-fixture) requests
- [ ] Build lands within the target time window
- [ ] Zero hardcoded `"chat"` branching anywhere in the pipeline — audit pass
- [ ] All 5 items of MVP §03 Definition of Done verified
- [ ] Agent Factory app deployed to Vercel; Supabase production project + secrets configured
- [ ] Production smoke test
- [ ] MVP complete → signal to move to Phase 1 (voice), per MVP §05
