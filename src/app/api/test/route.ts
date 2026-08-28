import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/db/client";
import { getUser } from "@/lib/auth/getUser";
import { getAdapter } from "@/lib/pipeline/registry";
import "@/lib/pipeline/adapters";
import { SpecSchema } from "@/lib/pipeline/types";
import { buildAndPersist, type BuildFeedback } from "@/lib/pipeline/build";
import { runTestChecks, type CheckResult } from "@/lib/pipeline/test-runner";

const RequestBodySchema = z.object({
  agent_id: z.string().uuid(),
});

const MAX_ATTEMPTS = 3;

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

  let adapter;
  try {
    adapter = getAdapter(spec.agent_type);
  } catch {
    return NextResponse.json({ error: `Unknown agent_type "${spec.agent_type}"` }, { status: 400 });
  }

  const { data: buildRow, error: buildFetchError } = await supabase
    .from("build_artifacts")
    .select("system_prompt, selected_tools")
    .eq("agent_id", spec.agent_id)
    .maybeSingle();
  if (buildFetchError) {
    return NextResponse.json(
      { error: `Failed to load build artifacts: ${buildFetchError.message}` },
      { status: 500 }
    );
  }
  if (!buildRow) {
    return NextResponse.json({ error: "Agent has no build artifacts yet -- run Build first" }, { status: 400 });
  }

  let systemPrompt: string = buildRow.system_prompt;
  let selectedTools: string[] = buildRow.selected_tools;
  let lastChecks: CheckResult[] = [];

  // Accumulates every criterion that has EVER failed, not just the most
  // recent attempt's failures. Only passing the latest failure lets a
  // rebuild fix it by silently regressing something that was already
  // passing (observed live: fixing distress-escalation broke off-topic
  // refusal, then the next fix re-broke distress-escalation). Keeping a
  // criterion in here even after it starts passing again is deliberate --
  // it's the reminder that stops it drifting back.
  const feedbackByCriterion = new Map<string, string>();

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    if (attempt > 1) {
      const feedback: BuildFeedback[] = Array.from(feedbackByCriterion, ([criterion, reasoning]) => ({
        criterion,
        reasoning,
      }));
      const outcome = await buildAndPersist(spec, feedback);
      if (!outcome.ok) {
        return NextResponse.json(
          { error: `Rebuild (attempt ${attempt}) failed: ${outcome.error}` },
          { status: 502 }
        );
      }
      systemPrompt = outcome.systemPrompt;
      selectedTools = outcome.selectedTools;
    }

    const checks = await runTestChecks(
      spec.agent_id,
      spec,
      systemPrompt,
      selectedTools,
      adapter.test.additionalChecks
    );
    if (!checks) {
      return NextResponse.json(
        { error: `Test run (attempt ${attempt}) failed to produce valid results after retrying` },
        { status: 502 }
      );
    }
    lastChecks = checks;

    const passed = checks.every((c) => c.passed);

    const { data: runRow, error: runInsertError } = await supabase
      .from("test_runs")
      .insert({ agent_id: spec.agent_id, attempt_number: attempt, passed })
      .select("id")
      .single();
    if (runInsertError || !runRow) {
      return NextResponse.json(
        { error: `Failed to persist test run: ${runInsertError?.message}` },
        { status: 500 }
      );
    }

    const { error: checksInsertError } = await supabase.from("test_checks").insert(
      checks.map((c) => ({
        test_run_id: runRow.id,
        check_type: c.check_type,
        description: c.description,
        test_input: c.test_input,
        agent_response: c.agent_response,
        passed: c.passed,
        reasoning: c.reasoning,
      }))
    );
    if (checksInsertError) {
      return NextResponse.json(
        { error: `Failed to persist test checks: ${checksInsertError.message}` },
        { status: 500 }
      );
    }

    if (passed) {
      await supabase.from("agents").update({ status: "tested" }).eq("id", spec.agent_id);
      return NextResponse.json({ agent_id: spec.agent_id, status: "tested", attempts: attempt, checks });
    }

    for (const c of checks) {
      if (!c.passed) feedbackByCriterion.set(c.description, c.reasoning);
    }
  }

  await supabase.from("agents").update({ status: "needs_review" }).eq("id", spec.agent_id);
  return NextResponse.json({
    agent_id: spec.agent_id,
    status: "needs_review",
    attempts: MAX_ATTEMPTS,
    checks: lastChecks,
  });
}
