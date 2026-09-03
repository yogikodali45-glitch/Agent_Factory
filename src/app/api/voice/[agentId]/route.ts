import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import twilio from "twilio";
import { createAdminClient } from "@/lib/db/client";
import { getAdapter } from "@/lib/pipeline/registry";
import "@/lib/pipeline/adapters";
import { SpecSchema } from "@/lib/pipeline/types";
import { runAgentTurn, type AgentTurnResult, type AgentTurnMessage } from "@/lib/pipeline/agent";
import { persistTurn } from "@/lib/pipeline/persist-turn";

export const maxDuration = 30;

// Twilio's own webhook timeout is ~15s, tighter than Vercel's ceiling --
// that's the real budget for this handler (DB + Euri round trips), not
// maxDuration.

// This route is called only by Twilio, never a browser -- every response,
// success or error, must be valid TwiML (text/xml), never
// NextResponse.json(...). Twilio plays a generic "application error"
// message on anything else, which tells a real caller nothing useful.
function twimlResponse(twiml: InstanceType<typeof twilio.twiml.VoiceResponse>): NextResponse {
  return new NextResponse(twiml.toString(), { headers: { "Content-Type": "text/xml" } });
}

function errorTwiml(message: string): NextResponse {
  const twiml = new twilio.twiml.VoiceResponse();
  twiml.say(message);
  twiml.hangup();
  return twimlResponse(twiml);
}

// A self-explanatory instruction, not a magic sentinel the model has to
// recognize -- Build's own system prompt is itself LLM-generated, so it
// can't be trusted to reproduce an exact marker string verbatim (tried
// that; a generated prompt once quietly dropped a bracket). Phrasing
// this as a plain directive works regardless of how Build paraphrases
// anything, since there's no special string for it to get wrong.
const CALL_CONNECTED = "(The call has just connected. Greet the caller.)";

export async function POST(req: NextRequest, { params }: { params: Promise<{ agentId: string }> }) {
  const { agentId } = await params;

  if (!z.string().uuid().safeParse(agentId).success) {
    return errorTwiml("Sorry, this line isn't set up correctly.");
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return errorTwiml("Sorry, something went wrong.");
  }
  const bodyParams: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    bodyParams[key] = String(value);
  }

  // Signature validation happens before anything derived from the body
  // is trusted or acted on -- this route has no other auth concept, and
  // an unverified version of it is a way to run up the Euri bill and
  // inject fake bookings/escalations.
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const signature = req.headers.get("x-twilio-signature") ?? "";
  const url = `${req.nextUrl.origin}${req.nextUrl.pathname}`;
  if (!authToken || !twilio.validateRequest(authToken, signature, url, bodyParams)) {
    return errorTwiml("Sorry, this request could not be verified.");
  }

  const callSid = bodyParams.CallSid;
  const speechResult = bodyParams.SpeechResult?.trim();
  if (!callSid) {
    return errorTwiml("Sorry, something went wrong.");
  }

  const supabase = createAdminClient();
  const { data: agentRow, error: fetchError } = await supabase
    .from("agents")
    .select("id, spec, status")
    .eq("id", agentId)
    .maybeSingle();

  if (fetchError || !agentRow) {
    return errorTwiml("Sorry, this agent could not be found.");
  }
  if (agentRow.status !== "ready_to_try" && agentRow.status !== "deployed") {
    return errorTwiml("Sorry, this agent hasn't been deployed yet.");
  }

  const specResult = SpecSchema.safeParse(agentRow.spec);
  if (!specResult.success) {
    return errorTwiml("Sorry, something went wrong.");
  }
  const spec = specResult.data;

  // Registry-resolved, not agent_type === "voice" directly -- a Twilio
  // number pointed at the wrong agent should fail cleanly, not silently
  // run a non-phone agent's prompt through TwiML.
  let adapter;
  try {
    adapter = getAdapter(spec.agent_type);
  } catch {
    return errorTwiml("Sorry, this agent's type isn't recognized.");
  }
  if (!adapter.deploy.channels.includes("phone")) {
    return errorTwiml("Sorry, this agent isn't set up for phone calls.");
  }

  const { data: buildRow, error: buildError } = await supabase
    .from("build_artifacts")
    .select("system_prompt, selected_tools")
    .eq("agent_id", agentId)
    .maybeSingle();
  if (buildError || !buildRow) {
    return errorTwiml("Sorry, something went wrong.");
  }

  const { data: callRow } = await supabase
    .from("voice_calls")
    .select("history")
    .eq("call_sid", callSid)
    .maybeSingle();
  const history: AgentTurnMessage[] = callRow?.history ?? [];

  const userMessage = speechResult && speechResult.length > 0 ? speechResult : CALL_CONNECTED;

  let turn: AgentTurnResult;
  try {
    turn = await runAgentTurn({
      agentId,
      spec,
      systemPrompt: buildRow.system_prompt,
      selectedTools: buildRow.selected_tools,
      userMessage,
      history,
    });
  } catch {
    return errorTwiml("Sorry, something went wrong on our end.");
  }

  await persistTurn(supabase, agentId, "call", turn);

  const nextHistory: AgentTurnMessage[] = [
    ...history,
    { role: "user", content: userMessage },
    { role: "assistant", content: turn.reply },
  ];
  const { error: upsertError } = await supabase
    .from("voice_calls")
    .upsert({ call_sid: callSid, agent_id: agentId, history: nextHistory });
  if (upsertError) {
    console.error(`Failed to persist voice_calls for call ${callSid}: ${upsertError.message}`);
  }

  const twiml = new twilio.twiml.VoiceResponse();
  const saidGoodbye = speechResult ? /\b(bye|goodbye|that'?s all)\b/i.test(speechResult) : false;

  if (saidGoodbye) {
    twiml.say(turn.reply);
    twiml.hangup();
    return twimlResponse(twiml);
  }

  // A <Gather> that times out with no speech falls through to whatever
  // TwiML comes next in this same document (actionOnEmptyResult defaults
  // false) -- the retry-then-hangup path below needs no server logic.
  const actionUrl = `${req.nextUrl.origin}/api/voice/${agentId}`;
  const gatherAttrs = {
    input: ["speech" as const],
    action: actionUrl,
    method: "POST",
    speechTimeout: "auto",
    timeout: 5,
  };

  const firstGather = twiml.gather(gatherAttrs);
  firstGather.say(turn.reply);

  twiml.say("Sorry, I didn't catch that.");
  const retryGather = twiml.gather(gatherAttrs);
  retryGather.say("Could you say that again?");

  twiml.say("I still didn't hear anything. Goodbye.");
  twiml.hangup();

  return twimlResponse(twiml);
}
