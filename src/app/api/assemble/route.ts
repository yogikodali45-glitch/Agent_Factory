import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { euri, EMBEDDING_MODEL } from "@/lib/llm/client";
import { createAdminClient } from "@/lib/db/client";
import { getUser } from "@/lib/auth/getUser";
import { SpecSchema } from "@/lib/pipeline/types";
import { extractSource, chunkText } from "@/lib/pipeline/ingest";

const RequestBodySchema = z.object({
  agent_id: z.string().uuid(),
});

interface PendingChunk {
  source_label: string;
  content: string;
}

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsedBody = RequestBodySchema.safeParse(json);
  if (!parsedBody.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsedBody.error.issues },
      { status: 400 }
    );
  }

  const supabase = createAdminClient();
  const { data: agentRow, error: fetchError } = await supabase
    .from("agents")
    .select("id, spec, owner_id")
    .eq("id", parsedBody.data.agent_id)
    .maybeSingle();

  if (fetchError) {
    return NextResponse.json({ error: `Failed to load agent: ${fetchError.message}` }, { status: 500 });
  }
  if (!agentRow) {
    return NextResponse.json({ error: "No agent with that id" }, { status: 404 });
  }
  if (agentRow.owner_id !== user.id) {
    return NextResponse.json({ error: "This agent belongs to a different account" }, { status: 403 });
  }
  if (!agentRow.spec) {
    return NextResponse.json({ error: "Agent has no Spec yet -- run Intake first" }, { status: 400 });
  }

  const specResult = SpecSchema.safeParse(agentRow.spec);
  if (!specResult.success) {
    return NextResponse.json(
      { error: "Stored Spec failed re-validation", details: specResult.error.issues },
      { status: 500 }
    );
  }
  const spec = specResult.data;

  const pendingChunks: PendingChunk[] = [];
  const ingestionErrors: string[] = [];

  for (const source of spec.knowledge_sources) {
    try {
      const extracted = await extractSource(source);
      const pieces = chunkText(extracted.text);
      if (pieces.length === 0) {
        ingestionErrors.push(`${source.value}: extracted no text`);
        continue;
      }
      for (const content of pieces) {
        pendingChunks.push({ source_label: extracted.label, content });
      }
    } catch (e) {
      ingestionErrors.push(`${source.value}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  if (spec.knowledge_sources.length > 0 && pendingChunks.length === 0) {
    return NextResponse.json(
      { error: `All knowledge sources failed to ingest: ${ingestionErrors.join("; ")}` },
      { status: 502 }
    );
  }

  let embeddings: number[][] = [];
  if (pendingChunks.length > 0) {
    try {
      const res = await euri.embeddings.create({
        model: EMBEDDING_MODEL,
        input: pendingChunks.map((c) => c.content),
      });
      embeddings = res.data.map((d) => d.embedding);
    } catch (e) {
      return NextResponse.json(
        { error: `Embedding call failed: ${e instanceof Error ? e.message : String(e)}` },
        { status: 502 }
      );
    }
  }

  // Idempotent: re-running Assemble replaces this agent's chunks rather
  // than accumulating stale ones alongside fresh ones.
  const { error: deleteError } = await supabase
    .from("knowledge_chunks")
    .delete()
    .eq("agent_id", spec.agent_id);
  if (deleteError) {
    return NextResponse.json(
      { error: `Failed to clear previous chunks: ${deleteError.message}` },
      { status: 500 }
    );
  }

  if (pendingChunks.length > 0) {
    const rows = pendingChunks.map((c, i) => ({
      agent_id: spec.agent_id,
      source_label: c.source_label,
      chunk_index: i,
      content: c.content,
      embedding: JSON.stringify(embeddings[i]),
    }));
    const { error: insertError } = await supabase.from("knowledge_chunks").insert(rows);
    if (insertError) {
      return NextResponse.json(
        { error: `Failed to persist knowledge chunks: ${insertError.message}` },
        { status: 500 }
      );
    }
  }

  const { error: statusError } = await supabase
    .from("agents")
    .update({ status: "assembled" })
    .eq("id", spec.agent_id);
  if (statusError) {
    return NextResponse.json(
      { error: `Failed to update agent status: ${statusError.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({
    agent_id: spec.agent_id,
    sources_processed: spec.knowledge_sources.length,
    chunks_created: pendingChunks.length,
    ingestion_errors: ingestionErrors,
  });
}
