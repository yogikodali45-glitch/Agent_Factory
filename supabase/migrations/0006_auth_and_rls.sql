-- Milestone 6: Auth + data scoping (PRD §04, Data handling).
--
-- IMPORTANT: every route in this app uses the service-role client
-- (src/lib/db/client.ts createAdminClient), which bypasses RLS entirely.
-- The real access control is the explicit owner_id check each route does
-- in code (src/lib/auth/getUser.ts + a .eq("owner_id", user.id) filter).
-- RLS below is defense-in-depth for any future code path that queries
-- Supabase directly with a user's own session (anon key + their JWT) --
-- nothing in this app does that today. Don't mistake this for the thing
-- actually protecting data right now.

alter table agents add column owner_id uuid not null references auth.users(id) on delete cascade;
create index agents_owner_id_idx on agents (owner_id);

alter table agents enable row level security;
alter table build_artifacts enable row level security;
alter table knowledge_chunks enable row level security;
alter table test_runs enable row level security;
alter table test_checks enable row level security;
alter table deploy_configs enable row level security;

create policy "owner can access own agents" on agents
  for all using (owner_id = auth.uid());

create policy "owner can access own build_artifacts" on build_artifacts
  for all using (agent_id in (select id from agents where owner_id = auth.uid()));

create policy "owner can access own knowledge_chunks" on knowledge_chunks
  for all using (agent_id in (select id from agents where owner_id = auth.uid()));

create policy "owner can access own test_runs" on test_runs
  for all using (agent_id in (select id from agents where owner_id = auth.uid()));

create policy "owner can access own test_checks" on test_checks
  for all using (
    test_run_id in (
      select id from test_runs where agent_id in (select id from agents where owner_id = auth.uid())
    )
  );

create policy "owner can access own deploy_configs" on deploy_configs
  for all using (agent_id in (select id from agents where owner_id = auth.uid()));
