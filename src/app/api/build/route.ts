import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { euri, DEFAULT_MODEL } from "@/lib/llm/client";
import { createServerClient } from "@/lib/db/client";
import { getAdapter } from "@/lib/pipeline/registry";
import "@/lib/pipeline/adapters";
import { CONNECTOR_LIBRARY } from "@/lib/pipeline/connectors";
import { SpecSchema, buildResultSchema, type Spec, type BuildResult } from "@/lib/pipeline/types";

const RequestBodySchema = z.object({
  agent_id: z.string().uuid(),
});

function systemPrompt(adapterGuidance: string, allowedConnectorIds: string[]): string {
  const allowed = CONNECTOR_LIBRARY.filter((c) => allowedConnectorIds.includes(c.id));
  const toolList = allowed.map((c) => `- ${c.id}: ${c.label} -- ${c.description}`).join("\n");

  return `You are the Build stage of Agent Factory. You take a validated Spec for an agent and produce two things: the agent's system prompt, and which tools it needs.

${adapterGuidance}

You may ONLY select tools from this exact list, by id. Never invent a tool id that isn't here:
${toolList}

Respond with ONLY a single JSON object, no markdown fences, no other text:
{"system_prompt":"...","selected_tools":["...","..."]}`;
}

function userMessage(spec: Spec): string {
  return `Spec:\n${JSON.stringify(
    {
      objectives: spec.objectives,
      tone: spec.tone,
      knowledge_sources: spec.knowledge_sources,
      required_tools: spec.required_tools,
      constraints: spec.constraints,
      escalation_rules: spec.escalation_rules,
    },
    null,
    2
  )}`;
}

async function runBuild(
  adapterGuidance: string,
  allowedConnectorIds: string[],
  spec: Spec
): Promise<BuildResult | null> {
  const schema = buildResultSchema(allowedConnectorIds);
  const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
    { role: "system", content: systemPrompt(adapterGuidance, allowedConnectorIds) },
    { role: "user", content: userMessage(spec) },
  ];

  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await euri.chat.completions.create({
      model: DEFAULT_MODEL,
      messages,
      response_format: { type: "json_object" },
      temperature: 0.2,
    });
    const raw = res.choices[0]?.message?.content ?? "";

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(raw);
    } catch {
      messages.push({ role: "assistant", content: raw });
      messages.push({
        role: "user",
        content: "That wasn't valid JSON. Return ONLY the JSON object, no other text.",
      });
      continue;
    }

    const result = schema.safeParse(parsedJson);
    if (result.success) return result.data;

    messages.push({ role: "assistant", content: raw });
    messages.push({
      role: "user",
      content: `That response didn't match the required shape: ${JSON.stringify(
        result.error.issues
      )}. Return ONLY the corrected JSON object.`,
    });
  }
  return null;
}

export async function POST(req: NextRequest) {
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

  const supabase = createServerClient();
  const { data: agentRow, error: fetchError } = await supabase
    .from("agents")
    .select("id, agent_type, spec")
    .eq("id", parsedBody.data.agent_id)
    .maybeSingle();

  if (fetchError) {
    return NextResponse.json({ error: `Failed to load agent: ${fetchError.message}` }, { status: 500 });
  }
  if (!agentRow) {
    return NextResponse.json({ error: "No agent with that id" }, { status: 404 });
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

  const build = await runBuild(adapter.build.promptGuidance, adapter.build.allowedConnectorIds, spec);
  if (!build) {
    return NextResponse.json(
      { error: "Build failed to produce a valid result after retrying" },
      { status: 502 }
    );
  }

  const { error: upsertError } = await supabase.from("build_artifacts").upsert({
    agent_id: spec.agent_id,
    system_prompt: build.system_prompt,
    selected_tools: build.selected_tools,
  });
  if (upsertError) {
    return NextResponse.json(
      { error: `Failed to persist build artifacts: ${upsertError.message}` },
      { status: 500 }
    );
  }

  const { error: statusError } = await supabase
    .from("agents")
    .update({ status: "built" })
    .eq("id", spec.agent_id);
  if (statusError) {
    return NextResponse.json(
      { error: `Failed to update agent status: ${statusError.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({
    agent_id: spec.agent_id,
    system_prompt: build.system_prompt,
    selected_tools: build.selected_tools,
  });
}
