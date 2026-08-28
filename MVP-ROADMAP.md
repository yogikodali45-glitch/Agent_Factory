# MVP Roadmap

Ordered build plan from an empty Next.js app to a complete MVP (MVP Scope §03 Definition of Done, all 5 items met on real requests).

Maps directly onto the Blueprint's 5-stage pipeline (Intake → Build → Assemble → Test → Deploy) — Milestone 1 is defined in Blueprint §07; Milestones 2–7 extend the same numbering, one per remaining stage plus the frontend and launch. This is a different "Milestone N" than the PRD/MVP's own "Phase 1" — Phase 1 (voice) only starts after every milestone here is done.

Check items off as we go. Re-order or split a milestone if reality disagrees with the plan — this file should track what's actually true, not what we guessed at the start.

## Setup — project scaffolding

- [x] Initialize Next.js (App Router, TypeScript) in the repo
- [x] Create the Supabase project — confirm `pgvector` is enabled when we run the first migration (Milestone 1)
- [x] Wire the Supabase client (`lib/db`) + environment variables (`.env.local`, gitignored) — verified live: connects and authenticates
- [x] Wire the Euri gateway client wrapper (`lib/llm`) — verified live against the free `gpt-4o-mini` model
- [x] Add zod as the validation layer
- [x] Confirm `npm run dev` runs a blank app locally

## Milestone 1 — Spec schema + Intake (Blueprint §07)

- [x] Write the Spec zod schema (`lib/pipeline/types`) — every field from Blueprint §02
- [x] Create the `agents` table in Supabase (migration `0001_agents.sql`), including `schema_version` and `pgvector` enabled
- [x] Build the registry module (`lib/pipeline/registry.ts`)
- [x] Build the chat `IntakeAdapter` (question set + required fields for the chat type)
- [x] Build the Intake stage: free-text request → Euri gateway → validated Spec (`/api/intake`)
- [x] Implement clarifying-question logic — fires only for fields Intake genuinely can't resolve
- [x] Minimal UI: request form + clarifying-question follow-up (`src/app/page.tsx`)
- [x] Run a fixed set of real-shaped test requests; confirm each produces a schema-valid Spec — 5/5 passed live against Supabase + Euri, including both clarification round-trips
- [x] Milestone 1 demo: request in → Spec out, nothing downstream wired yet — **Milestone 1 complete**

## Milestone 2 — Build

- [x] Build the chat `BuildAdapter` (prompt template + valid tool subset)
- [x] Persona/system-prompt generation from the Spec (Euri gateway call)
- [x] Define connector/tool library v0 — small fixed set (`faq_lookup`, `booking`, `escalate_to_human`)
- [x] Tool-selection logic against `required_tools` — schema-constrained to the type's allowed set, can't invent; verified it actually discriminates (3 test cases, each selecting a different correct subset)
- [x] Persist build artifacts (prompt, tool bindings) to Postgres (`build_artifacts`, cascade-deletes with its agent)
- [x] Build stage wired as its own invocation: reads the Spec, writes agent config (`/api/build`) — **Milestone 2 complete**

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
