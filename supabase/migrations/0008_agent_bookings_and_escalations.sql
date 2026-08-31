-- Second post-MVP addition: make booking and escalate_to_human real, the
-- same way 0007 made feedback_collection real. Both were purely
-- conversational before this -- the agent would say "I'll book you in" or
-- "let me get a human," and nothing existed anywhere for the business
-- owner to actually see.

create table if not exists agent_bookings (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references agents(id) on delete cascade,
  customer_name text,
  customer_contact text,
  -- Free text, not a timestamp -- there's no real calendar/availability
  -- system to normalize against yet, so this records what the customer
  -- asked for, not a validated slot.
  requested_time text not null,
  details text not null,
  created_at timestamptz not null default now()
);

create table if not exists agent_escalations (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references agents(id) on delete cascade,
  reason text not null,
  customer_contact text,
  created_at timestamptz not null default now()
);

create index if not exists agent_bookings_agent_id_idx on agent_bookings (agent_id);
create index if not exists agent_escalations_agent_id_idx on agent_escalations (agent_id);

alter table agent_bookings enable row level security;
alter table agent_escalations enable row level security;

create policy "owner can access own agent_bookings" on agent_bookings
  for all using (agent_id in (select id from agents where owner_id = auth.uid()));

create policy "owner can access own agent_escalations" on agent_escalations
  for all using (agent_id in (select id from agents where owner_id = auth.uid()));
