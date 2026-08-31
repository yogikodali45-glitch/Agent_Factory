-- First post-MVP addition: the feedback_collection connector. Unlike
-- booking/escalate_to_human (conversational only, no real backend --
-- MVP has no live systems to call), feedback that isn't recorded
-- anywhere isn't actually feedback, so this one needs a real table.

create table if not exists agent_feedback (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references agents(id) on delete cascade,
  comment text not null,
  -- 'positive' | 'neutral' | 'negative', not enforced by a check
  -- constraint -- the model assigns it, treat it as advisory, not a
  -- guaranteed enum until something downstream actually depends on it.
  sentiment text,
  created_at timestamptz not null default now()
);

create index if not exists agent_feedback_agent_id_idx on agent_feedback (agent_id);

alter table agent_feedback enable row level security;

create policy "owner can access own agent_feedback" on agent_feedback
  for all using (agent_id in (select id from agents where owner_id = auth.uid()));
