import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/db/client";
import { SpecSchema } from "@/lib/pipeline/types";
import { runAgentTurn } from "@/lib/pipeline/agent";

export const maxDuration = 30;

// This endpoint is meant to be called from whatever site embeds the
// widget -- an arbitrary external origin, not just this app. Open CORS
// is correct here, not an oversight: the widget is public by design.
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

const BodySchema = z.object({
  message: z.string().min(1),
  history: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string() }))
    .optional(),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ agentId: string }> }) {
  const { agentId } = await params;

  if (!z.string().uuid().safeParse(agentId).success) {
    return NextResponse.json({ error: "Invalid agent id" }, { status: 400, headers: CORS_HEADERS });
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400, headers: CORS_HEADERS });
  }

  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.issues },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  const supabase = createAdminClient();
  const { data: agentRow, error: fetchError } = await supabase
    .from("agents")
    .select("id, spec, status")
    .eq("id", agentId)
    .maybeSingle();

  if (fetchError) {
    return NextResponse.json(
      { error: `Failed to load agent: ${fetchError.message}` },
      { status: 500, headers: CORS_HEADERS }
    );
  }
  if (!agentRow) {
    return NextResponse.json({ error: "No agent with that id" }, { status: 404, headers: CORS_HEADERS });
  }
  if (agentRow.status !== "ready_to_try" && agentRow.status !== "deployed") {
    return NextResponse.json(
      { error: "This agent hasn't been deployed yet" },
      { status: 403, headers: CORS_HEADERS }
    );
  }

  const specResult = SpecSchema.safeParse(agentRow.spec);
  if (!specResult.success) {
    return NextResponse.json(
      { error: "Stored Spec failed re-validation" },
      { status: 500, headers: CORS_HEADERS }
    );
  }
  const spec = specResult.data;

  const { data: buildRow, error: buildError } = await supabase
    .from("build_artifacts")
    .select("system_prompt, selected_tools")
    .eq("agent_id", agentId)
    .maybeSingle();
  if (buildError || !buildRow) {
    return NextResponse.json(
      { error: `Agent has no build artifacts: ${buildError?.message ?? "none found"}` },
      { status: 500, headers: CORS_HEADERS }
    );
  }

  let reply: string;
  try {
    reply = await runAgentTurn({
      agentId,
      spec,
      systemPrompt: buildRow.system_prompt,
      selectedTools: buildRow.selected_tools,
      userMessage: parsed.data.message,
      history: parsed.data.history,
    });
  } catch (e) {
    return NextResponse.json(
      { error: `Agent failed to respond: ${e instanceof Error ? e.message : String(e)}` },
      { status: 502, headers: CORS_HEADERS }
    );
  }

  return NextResponse.json({ reply }, { headers: CORS_HEADERS });
}
