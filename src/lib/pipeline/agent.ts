import { z } from "zod";
import { euri, DEFAULT_MODEL } from "@/lib/llm/client";
import { searchKnowledge } from "./retrieval";
import type { Spec } from "./types";

export interface AgentTurnMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AgentTurnInput {
  agentId: string;
  spec: Spec;
  systemPrompt: string;
  selectedTools: string[];
  userMessage: string;
  // Prior turns, oldest first. Optional and unused by Test (each check is
  // independent) -- real for the deployed chat widget, which is an
  // actual multi-turn conversation.
  history?: AgentTurnMessage[];
}

export interface AgentFeedback {
  comment: string;
  sentiment: "positive" | "neutral" | "negative";
}

export interface AgentTurnResult {
  reply: string;
  feedback: AgentFeedback | null;
}

const feedbackTurnSchema = z.object({
  reply: z.string(),
  feedback: z
    .object({
      comment: z.string(),
      sentiment: z.enum(["positive", "neutral", "negative"]),
    })
    .nullable()
    .optional(),
});

// The actual "run the built agent" primitive -- what Test needs to
// generate anything gradeable, and eventually what Deploy exposes live.
// Tools like booking/escalate_to_human aren't real integrations yet
// (MVP has no live booking system to call) -- the agent is graded on
// what it *says* it'll do, not a real side effect. feedback_collection
// is the one exception: it's graded on what it says AND on what actually
// comes back in `feedback`, since that's what the caller persists.
export async function runAgentTurn(input: AgentTurnInput): Promise<AgentTurnResult> {
  let knowledgeContext = "";
  if (input.selectedTools.includes("faq_lookup") && input.spec.knowledge_sources.length > 0) {
    const chunks = await searchKnowledge(input.agentId, input.userMessage, 3);
    if (chunks.length > 0) {
      knowledgeContext =
        "\n\nRelevant knowledge (use this to answer if relevant; never invent facts beyond it):\n" +
        chunks.map((c, i) => `[${i + 1}] ${c.content}`).join("\n\n");
    }
  }

  const wantsFeedback = input.selectedTools.includes("feedback_collection");

  // response_format: json_object requires the word "json" to appear
  // somewhere in the messages, or Euri rejects the call outright.
  const systemContent =
    input.systemPrompt +
    knowledgeContext +
    (wantsFeedback
      ? `\n\nRespond in JSON, with this exact shape:
{"reply": "<what you say to the customer, in character>", "feedback": {"comment": "<a concise summary of what the customer said about their experience>", "sentiment": "positive" | "neutral" | "negative"} | null}
Set "feedback" only when the customer's LATEST message actually expresses an opinion about their experience (a review, complaint, praise, rating, or similar) -- otherwise set it to null. Don't invent feedback that wasn't given.`
      : "");

  const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
    { role: "system", content: systemContent },
    ...(input.history ?? []),
    { role: "user", content: input.userMessage },
  ];

  if (!wantsFeedback) {
    const res = await euri.chat.completions.create({
      model: DEFAULT_MODEL,
      messages,
      temperature: 0.4,
      max_tokens: 400,
    });
    return { reply: res.choices[0]?.message?.content ?? "", feedback: null };
  }

  const res = await euri.chat.completions.create({
    model: DEFAULT_MODEL,
    messages,
    response_format: { type: "json_object" },
    temperature: 0.4,
    max_tokens: 400,
  });
  const raw = res.choices[0]?.message?.content ?? "";

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch {
    // json_object mode is supposed to guarantee syntactically valid JSON --
    // if it still fails, degrade to plain text rather than losing the
    // customer-facing reply entirely.
    return { reply: raw, feedback: null };
  }

  const result = feedbackTurnSchema.safeParse(parsedJson);
  if (!result.success) return { reply: raw, feedback: null };

  return { reply: result.data.reply, feedback: result.data.feedback ?? null };
}
