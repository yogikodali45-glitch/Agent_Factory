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

export interface AgentBooking {
  customer_name: string | null;
  customer_contact: string | null;
  requested_time: string;
  details: string;
}

export interface AgentEscalation {
  reason: string;
  customer_contact: string | null;
}

export interface AgentTurnResult {
  reply: string;
  feedback: AgentFeedback | null;
  booking: AgentBooking | null;
  escalation: AgentEscalation | null;
}

const EMPTY_RESULT_FIELDS = { feedback: null, booking: null, escalation: null } as const;

// One connector id -> the JSON key it fills, the literal field shape shown
// in the prompt template, the instruction telling the model exactly when
// to fill it, and the zod schema for that key. `shape` has to be spelled
// out per connector, not replaced with a generic "{...}" placeholder --
// tried that once and the model invented its own field names (a "rating"
// key instead of "sentiment") for whichever object wasn't fully specified.
// Order here is the order instructions appear in the prompt.
const STRUCTURED_CONNECTORS = [
  {
    id: "feedback_collection",
    key: "feedback",
    shape: `{"comment": "...", "sentiment": "positive" | "neutral" | "negative"}`,
    instruction: `"feedback": only when the customer's LATEST message actually expresses an opinion about their experience (a review, complaint, praise, rating, or similar) -- otherwise null. Never invent feedback that wasn't given.`,
    schema: z.object({
      comment: z.string(),
      sentiment: z.enum(["positive", "neutral", "negative"]),
    }),
  },
  {
    id: "booking",
    key: "booking",
    shape: `{"customer_name": "..." | null, "customer_contact": "..." | null, "requested_time": "...", "details": "..."}`,
    instruction: `"booking": only when the customer's LATEST message is asking to schedule/book something -- capture whatever name, contact, requested time, and details they actually gave (use null for name/contact if they didn't give one). This only records a REQUEST for the business to confirm; you have no way to check real availability, so your "reply" must never claim the booking is confirmed -- say it's been noted/passed along, not that it's set.`,
    schema: z.object({
      customer_name: z.string().nullable().optional(),
      customer_contact: z.string().nullable().optional(),
      requested_time: z.string(),
      details: z.string(),
    }),
  },
  {
    id: "escalate_to_human",
    key: "escalation",
    shape: `{"reason": "...", "customer_contact": "..." | null}`,
    instruction: `"escalation": only when you are actually handing this conversation to a human per the escalation rules, or because the customer seems distressed or angry -- give a one-sentence reason. Otherwise null.`,
    schema: z.object({
      reason: z.string(),
      customer_contact: z.string().nullable().optional(),
    }),
  },
] as const;

// The actual "run the built agent" primitive -- what Test needs to
// generate anything gradeable, and eventually what Deploy exposes live.
// For most connectors (faq_lookup) the agent is graded on what it *says*
// it'll do, since there's no real backend to call. feedback_collection,
// booking, and escalate_to_human are the exceptions -- when selected, the
// turn also returns structured data the caller persists, not just talk.
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

  const active = STRUCTURED_CONNECTORS.filter((c) => input.selectedTools.includes(c.id));

  const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
    { role: "system", content: input.systemPrompt + knowledgeContext },
    ...(input.history ?? []),
    { role: "user", content: input.userMessage },
  ];

  if (active.length === 0) {
    const res = await euri.chat.completions.create({
      model: DEFAULT_MODEL,
      messages,
      temperature: 0.4,
      max_tokens: 400,
    });
    return { reply: res.choices[0]?.message?.content ?? "", ...EMPTY_RESULT_FIELDS };
  }

  // response_format: json_object requires the word "json" to appear
  // somewhere in the messages, or Euri rejects the call outright.
  const shape = active.map((c) => `"${c.key}": ${c.shape} | null`).join(", ");
  messages[0] = {
    ...messages[0],
    content:
      messages[0].content +
      `\n\nRespond in JSON, with this exact shape:\n{"reply": "<what you say to the customer, in character>", ${shape}}\nFor each key, set it only under these conditions, otherwise null:\n` +
      active.map((c) => `- ${c.instruction}`).join("\n"),
  };

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
    return { reply: raw, ...EMPTY_RESULT_FIELDS };
  }
  const obj = parsedJson as Record<string, unknown> | null;

  // Reply and each side-channel key are validated independently, not as
  // one combined schema -- an invalid "feedback" (e.g. a sentiment value
  // that doesn't match the enum) must not also discard a perfectly good
  // "booking" or "escalation" from the same turn, and must never cost the
  // customer their reply. Each key that fails validation is just dropped,
  // not treated as a reason to fail the whole turn.
  const reply = typeof obj?.reply === "string" ? obj.reply : raw;

  const result: AgentTurnResult = { reply, ...EMPTY_RESULT_FIELDS };
  for (const c of active) {
    const value = obj?.[c.key];
    if (value === null || value === undefined) continue;
    const parsed = c.schema.safeParse(value);
    if (parsed.success) (result as unknown as Record<string, unknown>)[c.key] = parsed.data;
  }
  return result;
}
