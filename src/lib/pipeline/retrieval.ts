import { euri, EMBEDDING_MODEL } from "@/lib/llm/client";
import { createAdminClient } from "@/lib/db/client";

export interface RetrievedChunk {
  content: string;
  source_label: string | null;
  similarity: number;
}

// The gap left after Milestone 3: Assemble only ever wrote the index,
// nothing read it back. This is that read path, via the
// match_knowledge_chunks RPC (pgvector's <=> isn't reachable through a
// plain PostgREST select).
export async function searchKnowledge(
  agentId: string,
  query: string,
  matchCount = 5
): Promise<RetrievedChunk[]> {
  const embedRes = await euri.embeddings.create({ model: EMBEDDING_MODEL, input: [query] });
  const queryEmbedding = embedRes.data[0].embedding;

  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("match_knowledge_chunks", {
    p_agent_id: agentId,
    p_query_embedding: JSON.stringify(queryEmbedding),
    p_match_count: matchCount,
  });

  if (error) {
    throw new Error(`Knowledge search failed: ${error.message}`);
  }
  return (data ?? []) as RetrievedChunk[];
}
