import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/db/client";
import { getUser } from "@/lib/auth/getUser";
import "@/lib/pipeline/adapters";
import { SpecSchema } from "@/lib/pipeline/types";
import { buildAndPersist } from "@/lib/pipeline/build";

const RequestBodySchema = z.object({
  agent_id: z.string().uuid(),
});

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

  const outcome = await buildAndPersist(specResult.data);
  if (!outcome.ok) {
    return NextResponse.json({ error: outcome.error }, { status: 502 });
  }

  return NextResponse.json({
    agent_id: specResult.data.agent_id,
    system_prompt: outcome.systemPrompt,
    selected_tools: outcome.selectedTools,
  });
}
