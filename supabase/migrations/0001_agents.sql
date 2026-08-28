-- Milestone 1: Spec schema + Intake, in isolation.
-- No build_artifacts / test_results / deploy_config tables yet -- those
-- land with the milestones that actually produce them.

create extension if not exists vector;

create table if not exists agents (
  id uuid primary key default gen_random_uuid(),
  agent_type text not null,
  schema_version int not null,

  -- No row exists until Intake fully resolves a Spec -- a round that
  -- needs clarification is stateless (the client resends the original
  -- request + Q&A on the next call), so there's no in-progress state to
  -- persist here. 'spec_ready' is the only status Milestone 1 writes;
  -- more arrive with the milestones that need them (Blueprint §04).
  status text not null default 'spec_ready',

  -- Validated against SpecSchema in code before this insert happens --
  -- not re-derived from anywhere else once written (PRD §03, Intake).
  spec jsonb not null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists agents_status_idx on agents (status);

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger agents_set_updated_at
before update on agents
for each row execute function set_updated_at();
