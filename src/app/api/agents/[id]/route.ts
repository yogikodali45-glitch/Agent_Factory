import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/db/client";
import { getUser } from "@/lib/auth/getUser";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const supabase = createAdminClient();

  const { data: agent, error: agentError } = await supabase
    .from("agents")
    .select("id, status, spec, owner_id")
    .eq("id", id)
    .maybeSingle();
  if (agentError) {
    return NextResponse.json({ error: agentError.message }, { status: 500 });
  }
  if (!agent) {
    return NextResponse.json({ error: "No agent with that id" }, { status: 404 });
  }
  if (agent.owner_id !== user.id) {
    return NextResponse.json({ error: "This agent belongs to a different account" }, { status: 403 });
  }

  const { data: build } = await supabase
    .from("build_artifacts")
    .select("system_prompt, selected_tools")
    .eq("agent_id", id)
    .maybeSingle();

  const { data: deployConfig } = await supabase
    .from("deploy_configs")
    .select("channels, is_live")
    .eq("agent_id", id)
    .maybeSingle();

  const { data: latestRun } = await supabase
    .from("test_runs")
    .select("id, attempt_number, passed, created_at")
    .eq("agent_id", id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let testChecks: unknown[] = [];
  if (latestRun) {
    const { data } = await supabase
      .from("test_checks")
      .select("check_type, description, test_input, agent_response, passed, reasoning")
      .eq("test_run_id", latestRun.id);
    testChecks = data ?? [];
  }

  return NextResponse.json({
    id: agent.id,
    status: agent.status,
    spec: agent.spec,
    build: build ?? null,
    deploy: deployConfig ?? null,
    latestTestRun: latestRun ?? null,
    testChecks,
  });
}
