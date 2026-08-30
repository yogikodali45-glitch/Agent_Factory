import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/db/client";
import { getUserOrAnonymous } from "@/lib/auth/getUser";
import { getAdapter } from "@/lib/pipeline/registry";
import "@/lib/pipeline/adapters";
import { SpecSchema } from "@/lib/pipeline/types";

export const maxDuration = 60;

const RequestBodySchema = z.object({
  agent_id: z.string().uuid(),
});

// Re-provisioning an already-live agent is allowed (idempotent) --
// only reject an agent that hasn't passed Test yet.
const PROVISIONABLE_STATUSES = new Set(["tested", "ready_to_try", "deployed"]);

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
    .select("id, spec, status, owner_id")
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
  if (!PROVISIONABLE_STATUSES.has(agentRow.status)) {
    return NextResponse.json(
      { error: `Agent must pass Test before it can be deployed (current status: ${agentRow.status})` },
      { status: 400 }
    );
  }

  const specResult = SpecSchema.safeParse(agentRow.spec);
  if (!specResult.success) {
    return NextResponse.json(
      { error: "Stored Spec failed re-validation", details: specResult.error.issues },
      { status: 500 }
    );
  }
  const spec = specResult.data;

  let adapter;
  try {
    adapter = getAdapter(spec.agent_type);
  } catch {
    return NextResponse.json({ error: `Unknown agent_type "${spec.agent_type}"` }, { status: 400 });
  }

  const { error: upsertError } = await supabase.from("deploy_configs").upsert({
    agent_id: spec.agent_id,
    channels: adapter.deploy.channels,
  });
  if (upsertError) {
    return NextResponse.json(
      { error: `Failed to persist deploy config: ${upsertError.message}` },
      { status: 500 }
    );
  }

  // Don't downgrade an already-live agent back to "ready to try".
  if (agentRow.status !== "deployed") {
    const { error: statusError } = await supabase
      .from("agents")
      .update({ status: "ready_to_try" })
      .eq("id", spec.agent_id);
    if (statusError) {
      return NextResponse.json(
        { error: `Failed to update agent status: ${statusError.message}` },
        { status: 500 }
      );
    }
  }

  // This route is generic across every agent type -- it must not assume
  // every type gets a chat_endpoint/embed_snippet. Only include them when
  // the type's own declared channels actually call for them (MVP DoD #5:
  // none of Intake/Build/Assemble/Test/Deploy hardcode "chat"). A future
  // voice type with channels: ["phone"] would get neither field here.
  const origin = req.nextUrl.origin;
  const channelUrls: Record<string, unknown> = {};
  if (adapter.deploy.channels.includes("chat_widget")) {
    channelUrls.chat_endpoint = `${origin}/api/chat/${spec.agent_id}`;
    channelUrls.embed_snippet = `<script src="${origin}/api/widget/${spec.agent_id}" async></script>`;
  }

  return NextResponse.json({
    agent_id: spec.agent_id,
    status: agentRow.status === "deployed" ? "deployed" : "ready_to_try",
    channels: adapter.deploy.channels,
    ...channelUrls,
  });
}
