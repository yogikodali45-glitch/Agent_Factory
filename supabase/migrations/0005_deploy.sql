-- Milestone 5: Deploy. Two states after Test passes: 'ready_to_try'
-- (provisioned, the widget/API work, but not yet promoted) and
-- 'deployed' (promoted to live) -- Blueprint §04's "whether it's been
-- promoted from 'try it yourself' to 'live'".

create table if not exists deploy_configs (
  agent_id uuid primary key references agents(id) on delete cascade,
  channels text[] not null,
  is_live boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger deploy_configs_set_updated_at
before update on deploy_configs
for each row execute function set_updated_at();
