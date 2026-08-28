import { euri, DEFAULT_MODEL } from "@/lib/llm/client";
import { createServerClient } from "@/lib/db/client";
import { getAdapter } from "./registry";
import { CONNECTOR_LIBRARY } from "./connectors";
import { buildResultSchema, type Spec, type BuildResult } from "./types";

export interface BuildFeedback {
  criterion: string;
  reasoning: string;
}

export type BuildOutcome =
  | { ok: true; systemPrompt: string; selectedTools: string[] }
  | { ok: false; error: string };

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

function userMessage(spec: Spec, feedback?: BuildFeedback[]): string {
  let msg = `Spec:\n${JSON.stringify(
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

  if (feedback && feedback.length > 0) {
    msg += `\n\nThis agent has failed the following checks at some point across earlier attempts -- some may be fixed already, but they've regressed before, so the new system prompt must satisfy ALL of them at once, not just whichever failed most recently:\n`;
    for (const f of feedback) {
      msg += `- "${f.criterion}": ${f.reasoning}\n`;
    }
  }

  return msg;
}

async function runBuildLLM(
  adapterGuidance: string,
  allowedConnectorIds: string[],
  spec: Spec,
  feedback?: BuildFeedback[]
): Promise<BuildResult | null> {
  const schema = buildResultSchema(allowedConnectorIds);
  const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
    { role: "system", content: systemPrompt(adapterGuidance, allowedConnectorIds) },
    { role: "user", content: userMessage(spec, feedback) },
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

// Runs Build and persists the result -- shared by /api/build (the first,
// manual attempt) and the Test retry loop (subsequent, feedback-driven
// attempts), so there's exactly one place that does this, not a
// self-referential HTTP call from Test back into /api/build.
export async function buildAndPersist(spec: Spec, feedback?: BuildFeedback[]): Promise<BuildOutcome> {
  let adapter;
  try {
    adapter = getAdapter(spec.agent_type);
  } catch {
    return { ok: false, error: `Unknown agent_type "${spec.agent_type}"` };
  }

  const build = await runBuildLLM(adapter.build.promptGuidance, adapter.build.allowedConnectorIds, spec, feedback);
  if (!build) {
    return { ok: false, error: "Build failed to produce a valid result after retrying" };
  }

  const supabase = createServerClient();
  const { error: upsertError } = await supabase.from("build_artifacts").upsert({
    agent_id: spec.agent_id,
    system_prompt: build.system_prompt,
    selected_tools: build.selected_tools,
  });
  if (upsertError) {
    return { ok: false, error: `Failed to persist build artifacts: ${upsertError.message}` };
  }

  const { error: statusError } = await supabase
    .from("agents")
    .update({ status: "built" })
    .eq("id", spec.agent_id);
  if (statusError) {
    return { ok: false, error: `Failed to update agent status: ${statusError.message}` };
  }

  return { ok: true, systemPrompt: build.system_prompt, selectedTools: build.selected_tools };
}
