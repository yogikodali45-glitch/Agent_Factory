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

// The actual "run the built agent" primitive -- what Test needs to
// generate anything gradeable, and eventually what Deploy exposes live.
// Tools like booking/escalate_to_human aren't real integrations yet
// (MVP has no live booking system to call) -- the agent is graded on
// what it *says* it'll do, not a real side effect.
export async function runAgentTurn(input: AgentTurnInput): Promise<string> {
  let knowledgeContext = "";
  if (input.selectedTools.includes("faq_lookup") && input.spec.knowledge_sources.length > 0) {
    const chunks = await searchKnowledge(input.agentId, input.userMessage, 3);
    if (chunks.length > 0) {
      knowledgeContext =
        "\n\nRelevant knowledge (use this to answer if relevant; never invent facts beyond it):\n" +
        chunks.map((c, i) => `[${i + 1}] ${c.content}`).join("\n\n");
    }
  }

  const res = await euri.chat.completions.create({
    model: DEFAULT_MODEL,
    messages: [
      { role: "system", content: input.systemPrompt + knowledgeContext },
      ...(input.history ?? []),
      { role: "user", content: input.userMessage },
    ],
    temperature: 0.4,
    max_tokens: 400,
  });

  return res.choices[0]?.message?.content ?? "";
}
