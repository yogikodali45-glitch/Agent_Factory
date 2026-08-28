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

- [x] Knowledge-source ingestion (docs/URLs) → chunk + embed — real HTTP fetch + HTML stripping for `url` sources (cheerio), literal text for `document` sources, paragraph-based chunker, `text-embedding-3-small` via Euri
- [x] Write embeddings to `pgvector`, scoped per `agent_id` (`knowledge_chunks`, cascade-deletes with its agent)
- [x] Chat `AssembleAdapter` — skipped on purpose: ingestion only branches on *source* type (url vs. document), never on *agent* type, so there's nothing for a per-type adapter to customize yet
- [x] Assemble stage wired as its own invocation (`/api/assemble`) — **Milestone 3 complete**

Verified live: a real URL fetch (example.com) plus a multi-paragraph document source that correctly split into 3 chunks, and a semantic-retrieval sanity check — 3 targeted queries against those chunks each matched the right one by cosine similarity (computed in the test, not yet a real endpoint — see below).

## Milestone 4 — Test

- [x] Success-criteria test runner — per-criterion pass/fail + full transcript, not a score (`/api/test`, `test-runner.ts`)
- [x] Baseline adversarial check set — 3 checks: prompt-injection resistance, off-topic refusal, distress-escalation
- [x] Chat `TestAdapter` — one type-specific check (conciseness, relevant to a chat widget specifically)
- [x] Structured-gap object on failure, sent back to Build (`BuildFeedback`) — **accumulated across attempts, not just the latest failure**, after a live run showed fixing one check could silently regress a previously-passing one
- [x] Retry loop capped at 3 total attempts, then agent state moves to `needs_review`
- [x] Persist test results + transcripts (`test_runs` + `test_checks`) — **Milestone 4 complete**

Also filled the gap flagged after Milestone 3 (no query-time retrieval existed): `searchKnowledge` + the `match_knowledge_chunks` RPC, built as part of `runAgentTurn` — the primitive Test needed to actually invoke a built agent at all, not a standalone endpoint guessed at in isolation.

Verified live end to end, Intake→Build→Assemble→Test, on two real Specs. One (bakery) converged in 2 attempts after the feedback-accumulation fix — same agent had exhausted all 3 attempts and landed in `needs_review` before the fix. The other (law firm, stricter constraints) genuinely exhausted 3 attempts on one persistent conciseness check and correctly landed in `needs_review` — the intended fallback, not a bug; confirmed by checking that the *other* check it failed on attempt 1 got fixed and never regressed.

## Milestone 5 — Deploy

- [x] Chat `DeployAdapter` — declares its channels (`chat_widget`, `api`); genuinely type-specific, unlike Assemble's skip
- [x] Embeddable chat widget that talks to the deployed agent — framework-free JS at `/api/widget/[agentId]`, agent id + origin baked in server-side, drop-in `<script>` tag for any external site
- [x] "Try it yourself" mode before the agent reaches real customers — `/api/chat/[agentId]` works as soon as status is `ready_to_try`, before promotion
- [x] Promote-to-live action (agent state → `deployed`) — `/api/deploy/promote`
- [x] Deploy stage wired as its own invocation (`/api/deploy`) — **Milestone 5 complete**

Note for later: this milestone is the *backend* for try-it-yourself and go-live — the widget, the chat API, the provision/promote endpoints, all API-only like every milestone before it. Milestone 6's "Try-the-agent chat interface" and "Go-live action" are the actual UI *inside the Agent Factory app* that calls these; they're not duplicates of what's here.

Verified live end to end: full pipeline through Test, provisioned, chatted with while `ready_to_try` (multi-turn — second turn correctly used context from the first without it being restated), promoted to `deployed`, chat continued working after. Also confirmed the negative cases: Deploy rejects an agent that hasn't passed Test (400), chat rejects an agent that hasn't been through Deploy (403). Widget script fetched and confirmed it bakes in the correct agent id and origin. Test data cleaned up after.

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
