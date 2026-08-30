import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/db/client";
import { getUserOrAnonymous } from "@/lib/auth/getUser";

const RequestBodySchema = z.object({
  agent_id: z.string().uuid(),
});

export async function POST(req: NextRequest) {
  const user = await getUserOrAnonymous(req);

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
    .select("id, status, owner_id")
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
  if (agentRow.status === "deployed") {
    return NextResponse.json({ agent_id: agentRow.id, status: "deployed" });
  }
  if (agentRow.status !== "ready_to_try") {
    return NextResponse.json(
      { error: `Agent must be provisioned before it can go live (current status: ${agentRow.status})` },
      { status: 400 }
    );
  }

  const { error: deployConfigError } = await supabase
    .from("deploy_configs")
    .update({ is_live: true })
    .eq("agent_id", agentRow.id);
  if (deployConfigError) {
    return NextResponse.json(
      { error: `Failed to update deploy config: ${deployConfigError.message}` },
      { status: 500 }
    );
  }

  const { error: statusError } = await supabase
    .from("agents")
    .update({ status: "deployed" })
    .eq("id", agentRow.id);
  if (statusError) {
    return NextResponse.json(
      { error: `Failed to update agent status: ${statusError.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({ agent_id: agentRow.id, status: "deployed" });
}
