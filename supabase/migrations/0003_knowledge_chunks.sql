-- Milestone 3: Assemble. One row per chunk, scoped to its agent -- a
-- business's knowledge never leaks across agents (PRD §04, Data handling).
--
-- No ANN index (ivfflat/hnsw) yet: those need a meaningful amount of data
-- to be worth anything, and pgvector's ivfflat can behave badly built
-- against a near-empty table. A sequential scan is fine at MVP scale;
-- add a real index when there's enough data for it to matter.

create table if not exists knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references agents(id) on delete cascade,
  source_label text,
  chunk_index int not null,
  content text not null,
  -- text-embedding-3-small is 1536-dimensional. Changing embedding model
  -- means changing this column, not just the code that fills it.
  embedding vector(1536) not null,
  created_at timestamptz not null default now()
);

create index if not exists knowledge_chunks_agent_id_idx on knowledge_chunks (agent_id);
