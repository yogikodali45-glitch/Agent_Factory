-- Milestone 2: Build. One row per agent -- if Build ever re-runs (a
-- future retry loop from Test, Blueprint §05), this gets upserted, not
-- appended to.

create table if not exists build_artifacts (
  agent_id uuid primary key references agents(id) on delete cascade,
  system_prompt text not null,
  selected_tools text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger build_artifacts_set_updated_at
before update on build_artifacts
for each row execute function set_updated_at();
