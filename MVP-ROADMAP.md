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

- [x] Submit-request page (`/new`)
- [x] Clarifying-questions page (same page, second step)
- [x] Build-status view — no polling needed: the frontend itself drives Build→Assemble→Test→Deploy-provision sequentially, so the progress label is just whichever `await` is in flight. The business owner never sees the pipeline underneath (PRD personas) — only "try it" and "go live" are real clicks.
- [x] Pass/fail results + transcript review page (`/agents/[id]`)
- [x] Try-the-agent chat interface (same page, hits the same public `/api/chat/[agentId]` the embed widget uses)
- [x] Go-live action (same page, calls `/api/deploy/promote`)
- [x] Supabase Auth wired in — magic link (email only, no password) via a Bearer-token pattern, not cookie/SSR sessions — no `@supabase/ssr`, no middleware, fits the existing "browser only talks to our own API routes" architecture
- [x] Data scoping enforced (RLS) on all 6 tables — **and** explicit `owner_id` checks in every pipeline route, which is the mechanism actually doing the enforcing since every route uses the service-role client (bypasses RLS by design); RLS is real defense-in-depth, not decorative — **Milestone 6 complete**

Renamed the service-role client `createServerClient` → `createAdminClient` mid-milestone — that name was about to collide with a very different concept (a real user-session-aware client) and the confusion would have been a landmine for later.

Verified with two real test users (created via the admin API, magic-link sessions obtained via `admin.generateLink` + injected into the browser — same mechanism a real magic link uses, no email inbox needed) in both the API layer and a real browser: full pipeline run, live try-it chat, go-live, and the negative cases — unauthenticated blocked (401), wrong owner blocked on every route (403), a **raw RLS query** (anon key + the wrong user's own JWT) returning zero rows for the other user's agent, and the actual UI confirming a second user's home page shows "No agents yet" and a direct link to the first user's agent shows "belongs to a different account." Test users and data cleaned up after.

## Milestone 7 — MVP validation & launch

- [x] Full pipeline run end-to-end on real (non-fixture) requests — deliberately messier, more varied phrasing than any prior test case, run both locally and against production
- [x] Build lands within the target time window — measured ~20-35s, Intake through a tryable agent, across multiple real runs (local and production). BRD §04 left this as an explicit TBD pending real measurement; now has real numbers.
- [x] Zero hardcoded `"chat"` branching anywhere in the pipeline — audit pass. Found and fixed 2 real violations: `/api/deploy` unconditionally returned chat-shaped fields regardless of the type's declared channels; `test-runner.ts`'s scenario prompt said "chat agent" explicitly. Confirmed via grep afterward: zero literal `agent_type`/`"chat"` conditionals anywhere.
- [x] All 5 items of MVP §03 Definition of Done verified — the real test run also surfaced and fixed a genuine gap: Intake could turn an objective with no real backing capability (e.g. live inventory lookup — not in MVP's connector library at all) into a success_criterion nothing could ever satisfy. Fixed by giving Intake visibility into the actual connector library so it converts out-of-scope asks into honest escalation rules instead.
- [x] Agent Factory app deployed to Vercel; Supabase production project + secrets configured — same Supabase project as dev (no separate staging split, consistent with this build's approach throughout); live at https://agent-factory-tan.vercel.app
- [x] Production smoke test — full pipeline run against the live URL: Intake→Build→Assemble→Test (7/7 passed, 2 attempts)→Deploy→live chat (correct CORS, correct contextual reply)→widget script (correctly scoped to the right agent)→promote to live, ~31s total. Also caught a real issue this way: Test took 16.7s in production, which would have failed under Vercel's old 10s default timeout — added explicit `maxDuration` to every pipeline route ahead of finding out the hard way in front of a real user.
- [x] MVP complete → signal to move to Phase 1 (voice), per MVP §05 — **all 7 Milestones done. MVP is complete.**

Worth knowing: two production test runs on the deliberately ambiguous/edge-case request landed in `needs_review` after 3 honest attempts — confirmed via transcript inspection this was genuine LLM grading inconsistency on a hard, ambiguous criterion (the free-tier model's real limit), not a technical failure. Every call completed correctly with no errors or timeouts either time. This is the Test/retry mechanism working as intended, not a defect — see BRD §07's own risk framing ("the test layer catching failures before an agent ever ships").

## Post-MVP

MVP's Definition of Done is met; everything below is enhancement on top of a complete product, tracked here rather than as renumbered milestones since MVP §03/§05 don't cover it.

### `feedback_collection` connector

- [x] Add `feedback_collection` to `CONNECTOR_LIBRARY` (`lib/pipeline/connectors.ts`)
- [x] Allow it in the chat `BuildAdapter`, with guidance so Build only selects it when the requester actually asked for feedback/reviews/ratings — not included by default the way `escalate_to_human` is
- [x] `agent_feedback` table (migration `0007_agent_feedback.sql`) — `agent_id` FK cascade-deletes with its agent, RLS + owner-scoped policy matching every other table
- [x] `runAgentTurn` extended to conditionally return `{reply, feedback}` — plain-text call unchanged for every agent without the connector; agents with it switch to `response_format: json_object` to get a structured `{comment, sentiment}` out when the customer's message actually contains an opinion, `null` otherwise
- [x] `/api/chat/[agentId]` persists non-null feedback to `agent_feedback`, still returns only `{reply}` to the client — no change to the widget's contract
- [x] `test-runner.ts` updated for the new return shape (`.reply` used for grading and `agent_response`; feedback isn't graded)

Verified live end to end against the local dev server (same Supabase project as production): a plumber-agent request that explicitly asked for booking + feedback correctly selected `booking`, `feedback_collection`, and `escalate_to_human`; passed Test (3 attempts, using the JSON-mode path for every check); deployed; a real feedback-shaped chat message persisted exactly one row with a sensible `comment`/`sentiment`; a follow-up booking message in the same conversation did not create a second row; the public chat response shape stayed exactly `{reply}` throughout. Regression check: a plain bakery FAQ agent that never mentioned feedback did not select the connector, and a direct isolated check of the plain (non-JSON) chat path confirmed it still returns a normal reply with the same unchanged response shape. Test data cleaned up after.

### Booking + escalation persistence

`booking` and `escalate_to_human` existed since Milestone 2 but were purely conversational -- the agent would say "I'll book you in" or "let me get a human," and nothing existed anywhere for the business owner to see. This closes that gap the same way `feedback_collection` closed it for feedback.

- [x] `agent_bookings` + `agent_escalations` tables (migration `0008_agent_bookings_and_escalations.sql`) -- same cascade-delete + RLS + owner-scoped-policy shape as every other table
- [x] `runAgentTurn` generalized from a single feedback-only branch to a data-driven list of "structured connectors" (`STRUCTURED_CONNECTORS` in `agent.ts`) -- any combination of `feedback_collection`/`booking`/`escalate_to_human` being selected produces one JSON-mode call returning `{reply, feedback, booking, escalation}`, each side-channel field null unless its connector is active
- [x] Each side-channel key validated independently against its own zod schema, not one combined schema -- see the real bug this fixed, below
- [x] Build's guidance (`adapters/chat/build.ts`) updated so the agent's own generated system prompt frames a booking as pending confirmation, never a done deal -- there's no real calendar to check availability against
- [x] `connectors.ts`'s `booking` description corrected to state this limitation (it previously just said "schedules or books," which Intake could plausibly read as a live capability); `feedback_collection`'s description used to say "unlike booking/escalation" to explain why it was the one that persisted -- no longer true, so that comparison was removed
- [x] `/api/chat/[agentId]` persists all three side-channels via one small shared `persist` helper instead of three copies of the same insert-and-log-on-error block

**Real bug found and fixed during testing, worth keeping in mind:** the first working version used one combined zod schema for `{reply, feedback, booking, escalation}` together. When a customer sent a pure feedback message (no booking, no escalation), the reply correctly acknowledged the feedback in words, but nothing was persisted -- the model had written `{"rating": "excellent", ...}` instead of the required `{"sentiment": "positive"|"neutral"|"negative", ...}`, which failed the combined schema, which silently discarded the *entire* turn's structured data, not just the malformed `feedback` key. Root cause traced to the prompt itself: the refactor from one connector to three had replaced each connector's literal field shape in the JSON template with a generic `"feedback": {...} | null` placeholder, so the model had nothing to anchor the internal field names to and invented its own. Fixed two ways: each connector's exact shape (`{"comment": "...", "sentiment": "positive" | "neutral" | "negative"}`, etc.) is spelled out literally in the prompt again, and validation was changed to check each side-channel key independently so one bad key can never take a good one down with it. Confirmed fixed via a minimal repro (debug-logged the raw model JSON, saw the wrong key name, fixed the prompt, re-ran) before re-running the full suite.

Verified live end to end: a plumber agent with `booking` + `feedback_collection` + `escalate_to_human` all selected passed Test; a booking message ("book me in for a leaky faucet repair next Tuesday at 10am, I'm Sam, 555-0142") persisted the name/contact/time/details correctly and the reply said the request was "passed along for confirmation" -- never "confirmed" or "booked"; a distress message ("burst pipe... I am furious... I need someone NOW") persisted a reason to `agent_escalations`; a feedback message in the same conversation still persisted correctly (the fixed bug, re-verified); an unrelated message ("what areas do you service?") created zero spurious rows in any of the three tables. One Test run in this session landed in `needs_review` after 3 attempts with zero code-level errors -- confirmed as the same LLM-grading variance already documented elsewhere in this file, not a regression, since the identical code passed cleanly on the very next run. Test data cleaned up after.

A broader roadmap conversation also covered a business-facing dashboard (bookings/feedback/customer interactions in one place) and whether many agents per business needs a "package" abstraction — the latter was resolved (no, the registry/connector pattern already handles it; see `CLAUDE.md`'s Current Focus). Asked to choose between the dashboard and Phase 1 voice as the next priority: the dashboard, since it makes the persistence work above actually useful to a business owner rather than just stored — see below.

### Customer activity section

Not a standalone dashboard page/route -- a new section on the existing per-agent page (`/agents/[id]`), fed by a new `/api/agents/[id]/activity` route. A business owner with more than one agent still checks each agent's own page; there's no view aggregating across agents yet (noted as an open question in `CLAUDE.md`).

- [x] `GET /api/agents/[id]/activity` -- owner-scoped (same `owner_id` check pattern as every other route), returns `agent_bookings`/`agent_feedback`/`agent_escalations` for one agent, newest first. Deliberately separate from `/api/agents/[id]` itself, which is polled repeatedly during the Build→Deploy auto-chain when these tables are always empty -- no point adding three queries to every one of those calls.
- [x] New "Customer activity" section on the agent page, shown once the agent is `ready_to_try`/`deployed`. Escalations shown first (needs a human), then bookings, then feedback -- ordered by urgency, not by table. Feedback gets the same colored sentiment badge styling as the existing PASS/FAIL test-check badges, for visual consistency. Empty state shown when all three are empty; manual "Refresh" button, no polling or realtime subscription (matches how the rest of this app works -- explicit actions, not live updates).

**Second real bug found and fixed, this time in the booking connector's actual behavior, not the JSON plumbing:** building this exposed that a fully-specified booking message ("book me for a drain cleaning this Friday at 2pm, I'm Alex, 555-3344") still didn't persist anything. The agent's reply asked for one more detail (an address) before treating the booking as done, and simply never populated the `booking` field while it waited -- so a customer who didn't continue the conversation had their booking silently lost, which defeats the entire point of persisting it. Root cause: the instruction only said to capture "whatever" the customer gave, without saying this had to happen independently of whether the agent's own reply was still asking for more. Fixed by explicitly decoupling the two: log a partial booking (time + what; name/contact nullable) the moment those are given, even if the reply keeps asking for more. Confirmed via a real Intake→Build→Test→Deploy→chat run: the exact same kind of message that failed before now persists correctly, and the reply still avoids overclaiming ("I'll pass this along... they'll confirm shortly").

Verified live: seeded a test agent with two bookings, two feedback entries, and one escalation directly in Supabase and confirmed the page renders all three sections correctly, ordered and styled as designed, zero console errors; seeded a second agent with no activity and confirmed the empty state renders; then, after the booking-instruction fix, ran the real pipeline end to end (Intake→Build→Test→Deploy→chat) and confirmed a genuine chat-driven booking shows up through the `/activity` endpoint, not just seeded data. Test data cleaned up after both passes.

## Phase 1: Voice — Slice 1

Asked to choose between the dashboard and Phase 1 voice as the next priority (see above): the dashboard first, since it made the persistence work actually useful; voice right after. This is the second registered agent type, the thing the registry/adapter architecture (Blueprint §03) was built for from the start — and the original motivating example for this whole product was a plumber whose agent "takes calls," not just chats.

**Confirmed with the user before building:** speech handled via Twilio's built-in `<Gather input="speech">` (STT) and `<Say>` (TTS), not a custom audio-streaming pipeline with separate STT/TTS vendors -- lets the phone channel reuse `runAgentTurn` almost unchanged. Scope deliberately narrow, matching how every milestone in this file started: one manually-configured Twilio number pointed at one test agent, proving the mechanism end to end -- not auto-provisioning a real number per deployed agent, and not an in-browser call simulator. Both explicitly deferred, not gaps.

A UI mockup was designed and approved first (Chat/Voice picker on `/new`; a "Try a test call" + phone-number section replacing chat's "Try it yourself" + embed snippet; Call/Chat tags on activity rows) -- see `CLAUDE.md` for where that artifact lives if it's still needed for reference.

- [x] `voice` adapter set (`lib/pipeline/adapters/voice/{intake,build,test,deploy,index}.ts`), registered exactly like `chat`
- [x] Voice's Build guidance: short spoken sentences, no lists/formatting, never suggest a website/visiting/clicking, explicit reply-brevity instruction (chat relies on Test to catch verbosity; voice states it directly too, since a long spoken answer can't be skimmed)
- [x] Voice's two Test-specific checks: `voice_no_visual_references`, `voice_speakable_brevity`
- [x] `voice_calls` table (migration `0009_voice_calls.sql`) -- per-call conversation history keyed by Twilio's `CallSid`, since Vercel functions are stateless between invocations and Twilio doesn't hold state for you
- [x] `channel` column on `agent_bookings`/`agent_feedback`/`agent_escalations` (migration `0010_activity_channel_tag.sql`) -- `'chat'` default (backfills every existing row atomically), `'call'` set by the voice route, `check` constraint (code-assigned, not LLM-assigned like `sentiment`, so constraining it is free correctness)
- [x] `persist-turn.ts` -- chat's inline persist closure extracted into a shared helper parameterized by channel, used by both routes now
- [x] `POST /api/voice/[agentId]` -- the Twilio webhook. Verifies `X-Twilio-Signature` before touching the DB or Euri; every response path (success and every error) returns valid TwiML, never JSON, since Twilio plays a generic error message on anything else; one route handles both the first call and every follow-up turn (Twilio re-POSTs to the same `action` URL on each `<Gather>` completion); a silence timeout falls through to a retry-then-hangup block declaratively, no server logic needed
- [x] `/new` -- Chat/Voice picker above the request textarea, type-aware placeholder copy
- [x] `/agents/[id]` -- try-it section now branches on `deploy.channels` (`chat_widget` vs `phone`), not on `agent_type` directly (registry-resolved, matching "registry, not branching"); voice agents get a "Try a test call" section showing the one shared test number (`NEXT_PUBLIC_VOICE_TEST_NUMBER`); activity rows show a Call/Chat badge; a "Voice agent"/"Chat agent" label was added near the status pill
- [x] `twilio` added as a real dependency (official SDK -- XML-escaping via `twiml.VoiceResponse`, signature validation via `validateRequest`; not hand-rolled)

**Two real bugs found and fixed, both from actually running the pipeline, not from inspection:**

1. Build's generated system prompt is itself LLM-written, so it can't be trusted to reproduce an exact sentinel string verbatim -- a run showed it quietly dropping a bracket from a `[[CALL_CONNECTED]]`-style marker meant to signal "the call just started, greet them." Fixed by not using a magic string at all: the first turn of a call sends a plain instruction ("The call has just connected. Greet the caller.") as the "user message," which needs no special system-prompt callout to work regardless of how Build paraphrases anything.
2. The voice agent defaulted to "check our website" when it didn't know something (hours, with no knowledge_sources given) -- a real behavior gap, not a grading fluke, confirmed by watching it happen and then confirming the fix changed the actual words the agent said, twice, across separate runs. Fixed by making the guidance actionable instead of just a prohibition: when it doesn't know something, offer a callback, never suggest checking a website -- a caller has no way to do that mid-call, unlike a chat customer with a browser open.

**Verification, phased:**

- *Pipeline mechanics (zero Twilio):* ran a real `agent_type: "voice"` request through Intake→Build→Test→Deploy across 5 separate runs. Registration, voice-appropriate generated prompts, and correct tool selection all confirmed reliably working. A clean 100% Test pass proved hard to land consistently across those 5 runs -- traced to the same free-tier-model instruction-following variance already documented elsewhere in this file (Milestone 4, Milestone 7's production runs), not a defect introduced here; two of the failures were even grading artifacts where the agent's actual behavior was correct but the small grading model misapplied a compound criterion (softened the check wording once that was clear). Rather than keep spending real Euri budget chasing a perfect Test run on a known model limitation, `/api/deploy`'s behavior for the new type was confirmed directly: seeded an agent with `status: "tested"`, called `/api/deploy`, confirmed it returned `channels: ["phone"]` with no `chat_endpoint`/`embed_snippet` -- exactly matching that route's own pre-existing comment anticipating this case.
- *Webhook mechanics, synthetic requests, real Twilio signing:* free Twilio trial account, real Auth Token, no phone number purchased. A script built Twilio-shaped form data and signed it with `twilio.getExpectedTwilioSignature` using the real token, then POSTed it straight at the local dev server's `/api/voice/<test-agent-id>`. Confirmed: a bad signature is rejected with an error TwiML, not processed as a real turn; a greeting-turn request (no `SpeechResult`) returns well-formed TwiML with a `<Say>`+`<Gather>`; a follow-up turn reusing the same `CallSid` with real-sounding speech ("book me for a leak repair next Tuesday, I'm Jordan, 555-2244") correctly extracted the booking and replied without overclaiming ("I'll pass this along for confirmation"); `voice_calls.history` correctly accumulated all 4 messages across both turns; the booking row persisted with `channel: "call"`. Fully clean pass, zero code-level issues.
- *A real phone call:* not yet done as of this writing -- the one step left. No purchase needed for it either; a free trial account includes one inbound-capable number, and this app is already live at a public HTTPS URL, so the number's webhook can point directly at production with no tunnel. Check `CLAUDE.md`'s Open Questions or git history for whether this has happened by the time you're reading this.
