# Agent Factory

Plain-language business request → a built, tested, deployed chat agent. No engineer on either side.

Full context lives in four planning docs in this repo's `docs/` folder — read the relevant one before making architectural calls, don't guess at something it already answered:
- `Agent-Factory-Business-Case.docx` (BRD) — why this is worth building, risks, target users
- `Agent-Factory-Product-Requirements.docx` (PRD) — what the product does, functional/non-functional requirements
- `Agent-Factory-MVP-Scope.docx` — what ships first, definition of done
- `Agent-Factory-Blueprint.docx` — how it's architected: spec schema, registry contract, Milestone 1 scope

@AGENTS.md

## Current focus

**The MVP is complete — all 7 Milestones done.** Live task tracker: `MVP-ROADMAP.md`, kept as the historical record of how it got built. Per MVP §05, this is the signal to move to Phase 1 (voice) — the registry pattern is now proven against production, not just theory, so a second agent type should genuinely be "write one adapter," not a redesign. Nothing in this repo currently targets Phase 1 work; check with the user before starting any of it.

Deployed and live at **https://agent-factory-tan.vercel.app** (Vercel, GitHub-linked — pushes to `main` auto-deploy). Same Supabase project backs both local dev and production; there is no separate staging database. Don't assume one exists.

Auth is Bearer-token based, not cookie/SSR sessions — the browser attaches its Supabase session's `access_token` to every API call (see `src/lib/auth/useAuth.ts` and `src/lib/auth/getUser.ts`). No `@supabase/ssr`, no middleware. Every pipeline route (`intake`/`build`/`assemble`/`test`/`deploy`/`deploy/promote`) requires a session and checks `owner_id` explicitly in code — that check, not RLS, is what actually protects data, since every route uses the service-role client (`createAdminClient`, `src/lib/db/client.ts`) which bypasses RLS by design. RLS is enabled on all 6 tables as real defense-in-depth, verified with a raw anon-key query, but don't mistake it for the primary gate. `chat/[agentId]` and `widget/[agentId]` are deliberately the only routes with no auth check — they're for end-customers on the business's own site, not the requester.

`runAgentTurn` (`src/lib/pipeline/agent.ts`) is the "invoke the built agent" primitive — system prompt + retrieved knowledge (`searchKnowledge`) + a user message → a reply. Both `/api/chat/[agentId]` and Test's grading depend on it — it's the one place that actually talks to a built agent.

Build's retry feedback (`BuildFeedback[]`) accumulates every criterion that's failed at ANY point across attempts, not just the most recent failure — passing only the latest failure let a rebuild fix it by silently regressing something that was already passing. Keep it that way; don't simplify it back down without re-checking against a real multi-attempt case.

Don't build ahead of MVP scope. Voice/email/automation agent types, cross-channel agents, marketplace connectors, team accounts, billing, and analytics are explicitly out of scope until later phases (PRD §05, MVP §02) — don't add scaffolding for them "while we're in there," even now that MVP itself is done.

## Stack

- **Language:** TypeScript everywhere — Next.js (App Router) for both the requester-facing frontend and the pipeline's API routes. One language, one deploy target, no cross-service auth/CORS to manage between a separate backend and frontend.
- **Database:** Postgres via Supabase, `pgvector` enabled. One service covers relational state (Spec, build artifacts, test results, deploy config), the vector index Assemble needs per agent, auth, and file storage.
- **LLM:** Euri AI gateway (OpenAI-compatible; `https://api.euron.one/api/v1/euri`), not Anthropic or OpenAI directly — same gateway the Stock Market project uses. Used for every call in the pipeline: Intake parsing, Build generation, Test grading and adversarial checks. Decided in PRD §06 / Blueprint §06. Pick the model per use case in code (`EURI_DEFAULT_MODEL` is only a fallback) — don't hardcode one model globally.
- **Default model for MVP:** `gpt-4o-mini` — free-tier eligible on Euri, but the free tier is only **10,000 tokens/day** (100k/day on a paid "Plus" account). That's not much headroom once Intake + Build + Test are all making calls per build — expect to hit it during active development, not just at scale. If it becomes a blocker, that's the signal to add wallet credit or move specific stages to a paid model, not to work around it.
- **Validation:** zod, at every stage boundary. This is the literal implementation of Blueprint §04's "schema-validated handoffs only, never free text" — a stage that skips validating its input or output is a bug, not a shortcut.
- **Hosting:** Vercel, live in production. Every pipeline route that makes real LLM/embedding calls (`intake`/`build`/`assemble`/`test`/`deploy`) sets `export const maxDuration = 60;`; `chat/[agentId]` sets 30. This isn't precautionary -- Test measured ~15-17s in real runs, which fails under Vercel's default 10s Hobby timeout. Add the same to any new route that calls Euri or does real DB work spanning multiple round trips.
- **Package manager:** npm. (pnpm caused real friction on Windows on a prior project here — strict "ignored builds" checks blocking scripts, compounded by an SSL cert issue — not worth re-hitting.)

## Why serverless shapes the pipeline

Vercel functions have execution time limits; a 5-stage pipeline with retries can't run as one long call. This isn't a workaround bolted on top — it matches the architecture that already exists: each stage (Intake / Build / Assemble / Test / Deploy) is its own invocation, reading the prior stage's persisted state from Postgres and writing its own. Pipeline position is state in the database (Blueprint §04's state list), never something held in memory across a request.

## Architecture non-negotiables (from the Blueprint)

- **Registry, not branching.** No stage's code ever contains `if agent_type === 'chat'`. Type-specific behavior goes through an adapter (`lib/pipeline/adapters/<type>/`) resolved via the registry. Milestone 1 registers exactly one type, but goes through the registry from day one — see Blueprint §03.
- **The Spec is the only handoff.** Every stage reads the previous stage's schema-validated output — never the requester's original free text, never another stage's internals (Blueprint §02).
- **Nothing invented.** Build selects tools from the connector library against `required_tools`; it never generates integration code per request (PRD §03).

## Structure

What's actually there, not a plan:

```
/src
  /app
    /api/intake, /api/build, /api/assemble, /api/test     one route per pipeline stage
    /api/deploy (+ /promote)                               provision, then go live
    /api/chat/[agentId], /api/widget/[agentId]             public -- no auth, end-customer facing
    /api/agents (+ /[id])                                  the requester's own agent list + detail
    /                     sign-in (magic link) / your agents list
    /new                  submit-request + clarifying-questions
    /agents/[id]          drives Build->Assemble->Test->Deploy-provision, then results + try-it + go-live
  /lib
    /pipeline/types.ts        Spec schema (zod) + per-stage input/output types
    /pipeline/registry.ts     Adapter interfaces + getAdapter/registerAdapter
    /pipeline/adapters/chat   the only registered type so far
    /pipeline/build.ts        buildAndPersist -- shared by /api/build and Test's retry loop
    /pipeline/agent.ts        runAgentTurn -- the "invoke a built agent" primitive
    /pipeline/retrieval.ts    searchKnowledge (pgvector via the match_knowledge_chunks RPC)
    /pipeline/test-runner.ts  scenario generation + grading
    /pipeline/connectors.ts   the v0 tool library (faq_lookup, booking, escalate_to_human)
    /pipeline/ingest.ts       url/document extraction + chunking
    /pipeline/baseline-checks.ts
    /db/client.ts          createAdminClient -- service-role, bypasses RLS, used by every route
    /db/browserClient.ts   anon-key client, browser-side auth only
    /llm/client.ts         Euri gateway wrapper + jsonCall.ts (shared call+parse+retry helper)
    /auth/getUser.ts       Bearer-token session validation
    /auth/useAuth.ts       browser session hook
/supabase/migrations    0001-0006, applied in order
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
- Spec schema field-level validation rules, how `needs_review` reaches a human (Blueprint §08) -- hosting itself is resolved (Vercel), this is about the human-review workflow specifically, which still doesn't exist anywhere in the app
- Auth is magic-link only for now -- if that ever needs to change (password, OAuth), reconsider the Bearer-token pattern too, not just the sign-in UI
