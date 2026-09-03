-- Phase 1 voice: conversation state for one phone call, keyed by
-- Twilio's CallSid. Vercel functions are stateless between invocations
-- and Twilio doesn't hold conversation state for you, so each webhook
-- hit reads history here, appends the new turn, and writes it back --
-- the same "state lives in Postgres, never in memory across a request"
-- constraint the rest of this pipeline already follows, applied at the
-- level of one call's turns instead of one agent's build stages.

create table if not exists voice_calls (
  call_sid text primary key,
  agent_id uuid not null references agents(id) on delete cascade,
  history jsonb not null default '[]',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists voice_calls_agent_id_idx on voice_calls (agent_id);

create trigger voice_calls_set_updated_at
before update on voice_calls
for each row execute function set_updated_at();

alter table voice_calls enable row level security;

create policy "owner can access own voice_calls" on voice_calls
  for all using (agent_id in (select id from agents where owner_id = auth.uid()));
