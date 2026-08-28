-- Milestone 4: Test. Everything the test runner needs: a real vector
-- search function (the gap flagged after Milestone 3 -- Assemble only
-- ever wrote the index, nothing read it back), plus storage for
-- per-check results and the transcript.

-- PostgREST doesn't expose the pgvector `<=>` operator directly through
-- its normal REST filters, so this goes through an RPC function instead
-- of a plain select -- the standard Supabase + pgvector pattern.
create or replace function match_knowledge_chunks(
  p_agent_id uuid,
  p_query_embedding vector(1536),
  p_match_count int default 5
)
returns table (id uuid, content text, source_label text, similarity float)
language sql stable
as $$
  select id, content, source_label, 1 - (embedding <=> p_query_embedding) as similarity
  from knowledge_chunks
  where agent_id = p_agent_id
  order by embedding <=> p_query_embedding
  limit p_match_count;
$$;

-- One row per Test invocation -- attempt_number tracks the retry loop
-- back to Build (Blueprint §05), capped at 3 by the route, not here.
create table if not exists test_runs (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references agents(id) on delete cascade,
  attempt_number int not null default 1,
  passed boolean not null,
  created_at timestamptz not null default now()
);

create index if not exists test_runs_agent_id_idx on test_runs (agent_id);

-- One row per individual check within a run -- this is the readable
-- transcript (PRD §03/§02): what was asked, what the agent said, why it
-- passed or failed. Never just a score.
create table if not exists test_checks (
  id uuid primary key default gen_random_uuid(),
  test_run_id uuid not null references test_runs(id) on delete cascade,
  check_type text not null, -- 'success_criteria' | 'baseline_adversarial'
  description text not null, -- the criterion text, or the baseline check's name
  test_input text not null,
  agent_response text not null,
  passed boolean not null,
  reasoning text not null,
  created_at timestamptz not null default now()
);

create index if not exists test_checks_test_run_id_idx on test_checks (test_run_id);
