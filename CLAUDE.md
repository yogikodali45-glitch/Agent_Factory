# Agent Factory

Plain-language business request → a built, tested, deployed agent that talks to customers over chat or phone. No engineer on either side.

Full context lives in four planning docs in this repo's `docs/` folder — read the relevant one before making architectural calls, don't guess at something it already answered:
- `Agent-Factory-Business-Case.docx` (BRD) — why this is worth building, risks, target users
- `Agent-Factory-Product-Requirements.docx` (PRD) — what the product does, functional/non-functional requirements
- `Agent-Factory-MVP-Scope.docx` — what ships first, definition of done
- `Agent-Factory-Blueprint.docx` — how it's architected: spec schema, registry contract, Milestone 1 scope

@AGENTS.md

## Current focus

**The MVP shipped (all 7 Milestones done), every MVP-era connector now has real persistence behind it, and Phase 1 (voice) is built and largely verified.** Live task tracker: `MVP-ROADMAP.md`, kept as the historical record of how it got built, now with a post-MVP section too.

Post-MVP additions so far, in order: **`feedback_collection`** (new connector, `agent_feedback` table), then making **`booking`** and **`escalate_to_human`** real too (`agent_bookings`, `agent_escalations` tables). The latter two existed since Milestone 2 but were purely conversational until now — the agent would say "I'll book you in" or "let me get a human," and nothing existed anywhere for the business owner to actually see. All three now follow the same shape: `runAgentTurn` extracts structured data alongside the reply, the caller persists it, and the customer-facing reply never overclaims what actually happened (a booking is framed as a pending request, since there's no real calendar to check availability against). See the `runAgentTurn` paragraph below for the mechanism.

A third post-MVP addition: a **customer activity section** on the existing per-agent page (`/agents/[id]`), fed by a new read-only `/api/agents/[id]/activity` route. This is NOT a standalone cross-agent dashboard — a business owner with multiple agents still checks each agent's own page, there's no aggregated view across agents yet. It shows escalations first (needs a human), then bookings, then feedback, fetched once the agent is `ready_to_try`/`deployed` plus a manual refresh button — no polling, no realtime subscription, matching how the rest of this app already works (explicit actions, not live updates).

Building this exposed a second real bug in the booking connector (the first was the schema one described in the `runAgentTurn` paragraph below): the model would ask a customer for one more detail (e.g. an address) before it considered a booking "complete," and simply never populated the `booking` field while waiting — meaning a customer who didn't continue the conversation had their booking silently lost, defeating the entire point of persisting it. Fixed by explicitly decoupling what gets logged from what the agent still asks for in its reply: the instruction now says to log a partial booking (time + what, name/contact nullable) the moment those are given, even if the agent's own reply is still asking for more. Confirmed via a real Intake→Build→Test→Deploy→chat run.

A broader product-direction conversation happened alongside all of this. One question it raised was resolved without a rearchitecture: whether a business owner creating many agents (e.g. a plumber wanting booking, feedback, and dispatch agents) needs a fixed "package" of prebuilt agents instead of per-business generation. It doesn't — the registry/connector pattern already handles this at the code level (one pipeline, data-driven per business); the real lever for consistency across agents is tightening Build's prompt templates, not a new abstraction. The other question it raised was Phase 1 voice vs. a dashboard — the dashboard was picked first (see above), then voice followed right after.

**Phase 1 voice — a second agent type, `voice`, registered exactly like `chat` (`src/lib/pipeline/adapters/voice/`).** Speech is handled entirely through Twilio's own `<Gather input="speech">` (STT) and `<Say>` (TTS) — deliberately not a custom audio-streaming pipeline with separate STT/TTS vendors, so the phone channel reuses `runAgentTurn` almost unchanged. The webhook (`src/app/api/voice/[agentId]/route.ts`) is called only by Twilio, never a browser: it verifies `X-Twilio-Signature` before touching the DB or Euri (`TWILIO_AUTH_TOKEN`, required — an unverified version of this route is a way to run up the Euri bill and inject fake bookings/escalations), reads/writes per-call conversation state in a new `voice_calls` table keyed by Twilio's `CallSid` (Vercel functions are stateless between invocations and Twilio doesn't hold state for you, so this is the same "state lives in Postgres" constraint the rest of the pipeline already follows), and returns TwiML (`text/xml`) on every single path, success or error — never `NextResponse.json(...)`, since Twilio plays a generic error message on anything else and a real caller hears nothing useful. `agent_bookings`/`agent_feedback`/`agent_escalations` gained a `channel` column (`'chat'` default, `'call'` set by the voice route via the same shared `persist-turn.ts` helper chat now also uses) so the customer-activity section can tag which channel produced each row.

Scope is deliberately narrow, matching how every milestone in this project started: one manually-configured Twilio number pointed at one test agent, to prove the mechanism end to end — not auto-provisioning a real phone number per deployed voice agent (that would mean `/api/deploy` calling Twilio's API, which it doesn't do yet), and not an in-browser call simulator on `/agents/[id]` (just a phone number from `NEXT_PUBLIC_VOICE_TEST_NUMBER` with "call this to try it" instructions). Both are explicit, labeled follow-ups, not gaps to silently fill in later.

Two real bugs found and fixed while building this, both from actually running the pipeline, not from inspection:
1. Build's generated system prompt is itself LLM-written, so it can't be trusted to reproduce an exact sentinel string verbatim — a run showed it quietly dropping a bracket from a `[[CALL_CONNECTED]]`-style marker meant to signal "the call just started, greet them." Fixed by not using a magic string at all: the first turn of a call sends a plain instruction ("The call has just connected. Greet the caller.") as the "user message" instead, which needs no special system-prompt callout to work.
2. The voice agent defaulted to "check our website" when it didn't know something (e.g. hours, with no knowledge_sources given) — a real behavior gap, not a grading fluke, confirmed by watching it happen and then confirming the fix changed the actual words the agent said. Voice's Build guidance now explicitly says: when it doesn't know something, offer to have someone call back, never suggest checking a website or visiting somewhere — a caller has no way to do that mid-call, unlike a chat customer.

Verification status: Intake→Build→Test→Deploy confirmed working for `agent_type: "voice"` across multiple real runs (registration, voice-appropriate prompts, correct tool selection, `/api/deploy` correctly returning `channels: ["phone"]` with no `chat_endpoint`/`embed_snippet`). A clean 100% Test pass proved hard to land consistently — traced to the same free-tier-model instruction-following variance already documented elsewhere in this file (Milestone 4, Milestone 7), not a new problem, so Deploy's behavior was confirmed directly rather than by chasing a perfect Test run. The webhook route itself was verified with real Twilio-signed synthetic requests (bad signature correctly rejected; a full greeting → booking-request → TwiML round trip persisted correctly end to end, including `voice_calls.history` and the `channel: "call"` tag) — this is real signature validation against a real Twilio Auth Token, just not yet a real phone call. That's the one step still outstanding: pointing an actual Twilio number's webhook at this app and placing one real call — see Open Questions if that hasn't happened yet by the time you're reading this.

Deployed and live at **https://agent-factory-tan.vercel.app** (Vercel, GitHub-linked — pushes to `main` auto-deploy). Same Supabase project backs both local dev and production; there is no separate staging database. Don't assume one exists.

Auth is Bearer-token based, not cookie/SSR sessions — the browser attaches its Supabase session's `access_token` to every API call when one exists (see `src/lib/auth/useAuth.ts` and `src/lib/auth/getUser.ts`). No `@supabase/ssr`, no middleware.

**Sign-in is temporarily bypassed (added right after Milestone 7 shipped, during early hands-on testing -- check MVP-ROADMAP.md / git log if you need to know how long this has been true).** Supabase's free-tier magic-link email rate limit made real sign-in a genuine blocker for that testing, so every pipeline route (`intake`/`build`/`assemble`/`test`/`deploy`/`deploy/promote`, plus `agents`/`agents/[id]`) now calls `getUserOrAnonymous` instead of `getUser` + a 401 -- an unauthenticated request falls back to one shared anonymous account (`ANONYMOUS_USER` in `src/lib/auth/getUser.ts`) rather than being rejected. The frontend no longer gates any page on being signed in either. `getUser` itself, `useAuth`, and the magic-link sign-in flow are all still intact and correct, just unused by default -- reverting is: swap `getUserOrAnonymous` back to `getUser` + 401 in those 8 routes, and re-add the `if (!user)` gates in `page.tsx`/`new/page.tsx`/`agents/[id]/page.tsx` (git history has the exact prior versions). Don't build real multi-tenant features (billing, sharing, anything assuming distinct owners matter) on top of the anonymous state -- it's one shared bucket right now, not real per-user data.

`owner_id` checks in code, not RLS, are what actually protect data on the routes that DO get a real session — every route uses the service-role client (`createAdminClient`, `src/lib/db/client.ts`) which bypasses RLS by design. RLS is enabled on all 7 tables as real defense-in-depth, verified with a raw anon-key query, but don't mistake it for the primary gate, and don't mistake the current anonymous bypass for RLS being broken -- RLS was never what the anonymous path relies on either way. `chat/[agentId]` and `widget/[agentId]` are deliberately the only routes with no auth concept at all — they're for end-customers on the business's own site, not the requester, and that was true before this bypass too.

`runAgentTurn` (`src/lib/pipeline/agent.ts`) is the "invoke the built agent" primitive — system prompt + retrieved knowledge (`searchKnowledge`) + a user message → `{reply, feedback, booking, escalation}`. `/api/chat/[agentId]`, `/api/voice/[agentId]`, and Test's grading all depend on it — it has no idea whether a message came from a chat widget or a phone call, and doesn't need to. Each of the three side-channel fields is null unless its connector (`feedback_collection`, `booking`, `escalate_to_human` respectively) is in `selected_tools` — and since Build includes `escalate_to_human` by default for nearly every agent, the structured (`response_format: json_object`) path is the common case now, not a rare one. The per-connector JSON shape is spelled out literally in the prompt (`STRUCTURED_CONNECTORS` in `agent.ts`) — never replace that with a generic placeholder; tried it once and the model invented its own field names (a `rating` key instead of `sentiment`) for whatever wasn't fully specified. Each side-channel key is validated against its own zod schema independently, not as one combined schema — an invalid `booking` must never also discard a perfectly good `feedback` from the same turn, and a validation failure on any side-channel key must never cost the customer their `reply`. This was a real bug (an all-or-nothing combined schema silently dropped valid feedback whenever booking or escalation was also active), caught by testing, not a hypothetical. `booking`'s instruction is explicit that it only records a REQUEST — the reply must never claim a booking is confirmed, since there's no real calendar to check availability against; Build's own guidance for each type reinforces the same rule in the generated system prompt itself, so both the extraction call and the agent's own persona stay honest about it. `persistTurn` (`src/lib/pipeline/persist-turn.ts`) persists any non-null fields to `agent_feedback`/`agent_bookings`/`agent_escalations` tagged with a `channel` (`"chat"` or `"call"`), shared by both routes so they can't drift on how this gets tagged; failures are logged via `console.error`, not thrown — a customer who already has their reply shouldn't get a 502 over a logging table. The chat route still returns only `{reply}` to the client — the widget script never sees any of it. Test's grading and `CheckResult.agent_response` both use `.reply` only — none of the three side channels are graded.

Build's retry feedback (`BuildFeedback[]`) accumulates every criterion that's failed at ANY point across attempts, not just the most recent failure — passing only the latest failure let a rebuild fix it by silently regressing something that was already passing. Keep it that way; don't simplify it back down without re-checking against a real multi-attempt case.

Don't build ahead of scope. Voice (Phase 1) is now in progress -- see above -- but email/automation agent types, cross-channel agents, marketplace connectors, team accounts, billing, and analytics are still explicitly out of scope until later phases (PRD §05, MVP §02) — don't add scaffolding for them "while we're in there."

## Stack

- **Language:** TypeScript everywhere — Next.js (App Router) for both the requester-facing frontend and the pipeline's API routes. One language, one deploy target, no cross-service auth/CORS to manage between a separate backend and frontend.
- **Database:** Postgres via Supabase, `pgvector` enabled. One service covers relational state (Spec, build artifacts, test results, deploy config), the vector index Assemble needs per agent, auth, and file storage.
- **LLM:** Euri AI gateway (OpenAI-compatible; `https://api.euron.one/api/v1/euri`), not Anthropic or OpenAI directly — same gateway the Stock Market project uses. Used for every call in the pipeline: Intake parsing, Build generation, Test grading and adversarial checks. Decided in PRD §06 / Blueprint §06. Pick the model per use case in code (`EURI_DEFAULT_MODEL` is only a fallback) — don't hardcode one model globally.
- **Default model for MVP:** `gpt-4o-mini` — free-tier eligible on Euri, but the free tier is only **10,000 tokens/day** (100k/day on a paid "Plus" account). That's not much headroom once Intake + Build + Test are all making calls per build — expect to hit it during active development, not just at scale. If it becomes a blocker, that's the signal to add wallet credit or move specific stages to a paid model, not to work around it.
- **Validation:** zod, at every stage boundary. This is the literal implementation of Blueprint §04's "schema-validated handoffs only, never free text" — a stage that skips validating its input or output is a bug, not a shortcut.
- **Hosting:** Vercel, live in production. Every pipeline route that makes real LLM/embedding calls (`intake`/`build`/`assemble`/`test`/`deploy`) sets `export const maxDuration = 60;`; `chat/[agentId]` sets 30. This isn't precautionary -- Test measured ~15-17s in real runs, which fails under Vercel's default 10s Hobby timeout. Add the same to any new route that calls Euri or does real DB work spanning multiple round trips.
- **Package manager:** npm. (pnpm caused real friction on Windows on a prior project here — strict "ignored builds" checks blocking scripts, compounded by an SSL cert issue — not worth re-hitting.)
- **Telephony (Phase 1 voice):** Twilio, via the official `twilio` npm package — both for `validateRequest`/`getExpectedTwilioSignature` (webhook signature verification) and `twiml.VoiceResponse` (XML generation with correct escaping). Not hand-rolled. Real per-minute cost, unlike Euri's free tier — small at this scale, but not free.

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
    /api/voice/[agentId]                                    public -- Twilio webhook, signature-verified instead
    /api/agents (+ /[id], + /[id]/activity)                the requester's own agent list + detail + customer activity
    /                     sign-in (magic link) / your agents list
    /new                  submit-request + clarifying-questions + agent-type picker
    /agents/[id]          drives Build->Assemble->Test->Deploy-provision, then results + try-it + go-live
  /lib
    /pipeline/types.ts        Spec schema (zod) + per-stage input/output types
    /pipeline/registry.ts     Adapter interfaces + getAdapter/registerAdapter
    /pipeline/adapters/chat   registered agent type: chat
    /pipeline/adapters/voice  registered agent type: voice (Phase 1)
    /pipeline/build.ts        buildAndPersist -- shared by /api/build and Test's retry loop
    /pipeline/agent.ts        runAgentTurn -- the "invoke a built agent" primitive
    /pipeline/persist-turn.ts persistTurn -- shared by the chat and voice routes, tags channel
    /pipeline/retrieval.ts    searchKnowledge (pgvector via the match_knowledge_chunks RPC)
    /pipeline/test-runner.ts  scenario generation + grading
    /pipeline/connectors.ts   the v0 tool library (faq_lookup, booking, escalate_to_human, feedback_collection)
    /pipeline/ingest.ts       url/document extraction + chunking
    /pipeline/baseline-checks.ts
    /db/client.ts          createAdminClient -- service-role, bypasses RLS, used by every route
    /db/browserClient.ts   anon-key client, browser-side auth only
    /llm/client.ts         Euri gateway wrapper + jsonCall.ts (shared call+parse+retry helper)
    /auth/getUser.ts       Bearer-token session validation
    /auth/useAuth.ts       browser session hook
/supabase/migrations    0001-0010, applied in order
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
- Whether the customer-activity section should become a real cross-agent dashboard (one view spanning every agent a business owner has, not one page per agent) -- not raised as a problem yet since most testing has been single-agent, but will matter the moment a real user has more than one
- Voice Phase 1's real-phone-call step (Phase D in how this was verified) -- check MVP-ROADMAP.md's voice section / git history for whether this has happened yet before assuming it has or hasn't
- Auto-provisioning a real phone number per deployed voice agent (calling Twilio's API from `/api/deploy`, instead of the one manually-configured test number this slice uses) -- explicitly deferred, not scheduled
- An in-browser call simulator for voice's "try it" experience (the design mockup this was built from showed one; this slice just shows a phone number instead) -- explicitly deferred, not scheduled
