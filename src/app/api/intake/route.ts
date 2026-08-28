import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { euri, DEFAULT_MODEL } from "@/lib/llm/client";
import { createAdminClient } from "@/lib/db/client";
import { getUser } from "@/lib/auth/getUser";
import { getAdapter } from "@/lib/pipeline/registry";
import "@/lib/pipeline/adapters";
import {
  IntakeExtractionSchema,
  SpecSchema,
  SCHEMA_VERSION,
  type IntakeExtraction,
} from "@/lib/pipeline/types";

const RequestBodySchema = z.object({
  agent_type: z.string().min(1),
  request: z.string().min(1),
  previous_questions: z.array(z.string()).optional(),
  answers: z.array(z.string()).optional(),
});

type RequestBody = z.infer<typeof RequestBodySchema>;

function systemPrompt(adapterGuidance: string): string {
  return `You are the Intake stage of Agent Factory, a platform that turns a business's plain-language request into a structured, testable spec for an AI agent. You do not build or deploy anything -- you only extract and validate the spec.

${adapterGuidance}

Respond with ONLY a single JSON object, no markdown fences, no other text, matching exactly one of these two shapes.

Complete (every field resolved):
{"status":"complete","objectives":["..."],"tone":"...","knowledge_sources":[{"type":"url","value":"...","label":"..."}],"required_tools":["..."],"constraints":["..."],"success_criteria":["..."],"escalation_rules":["..."]}

Needs clarification (only if a field genuinely cannot be resolved):
{"status":"needs_clarification","questions":["...","..."]}

Rules:
- Only ask about fields you genuinely cannot resolve from the request -- never ask about something you can reasonably infer, and never ask the requester to phrase test criteria themselves.
- Ask at most 5 questions, and only ones that actually block building the agent.
- objectives and success_criteria must never be empty.
- Output ONLY the JSON object -- no prose, no markdown fences.`;
}

function userMessage(body: RequestBody): string {
  let msg = `Business request:\n${body.request}`;
  if (body.previous_questions?.length && body.answers?.length) {
    msg += `\n\nPreviously asked clarifying questions and the business's answers:\n`;
    for (let i = 0; i < body.previous_questions.length; i++) {
      msg += `Q: ${body.previous_questions[i]}\nA: ${body.answers[i] ?? "(no answer given)"}\n`;
    }
  }
  return msg;
}

async function extractSpec(
  adapterGuidance: string,
  body: RequestBody
): Promise<IntakeExtraction | null> {
  const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
    { role: "system", content: systemPrompt(adapterGuidance) },
    { role: "user", content: userMessage(body) },
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

    const result = IntakeExtractionSchema.safeParse(parsedJson);
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
  const body = parsedBody.data;

  let adapter;
  try {
    adapter = getAdapter(body.agent_type);
  } catch {
    return NextResponse.json(
      { error: `Unknown agent_type "${body.agent_type}"` },
      { status: 400 }
    );
  }

  const extraction = await extractSpec(adapter.intake.promptGuidance, body);
  if (!extraction) {
    return NextResponse.json(
      { error: "Intake failed to produce a valid extraction after retrying" },
      { status: 502 }
    );
  }

  if (extraction.status === "needs_clarification") {
    return NextResponse.json({
      status: "needs_clarification",
      questions: extraction.questions,
    });
  }

  const specResult = SpecSchema.safeParse({
    schema_version: SCHEMA_VERSION,
    agent_id: randomUUID(),
    agent_type: body.agent_type,
    objectives: extraction.objectives,
    tone: extraction.tone,
    knowledge_sources: extraction.knowledge_sources,
    required_tools: extraction.required_tools,
    constraints: extraction.constraints,
    success_criteria: extraction.success_criteria,
    escalation_rules: extraction.escalation_rules,
    clarification_log: (body.previous_questions ?? []).map((question, i) => ({
      question,
      answer: body.answers?.[i] ?? "",
    })),
  });

  if (!specResult.success) {
    return NextResponse.json(
      { error: "Extraction did not produce a schema-valid Spec", details: specResult.error.issues },
      { status: 502 }
    );
  }
  const spec = specResult.data;

  const supabase = createAdminClient();
  const { error } = await supabase.from("agents").insert({
    id: spec.agent_id,
    owner_id: user.id,
    agent_type: spec.agent_type,
    schema_version: spec.schema_version,
    status: "spec_ready",
    spec,
  });
  if (error) {
    return NextResponse.json(
      { error: `Failed to persist agent: ${error.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({ status: "complete", agent_id: spec.agent_id, spec });
}
