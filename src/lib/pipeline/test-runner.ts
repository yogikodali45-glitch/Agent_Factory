import { z } from "zod";
import { jsonCall } from "@/lib/llm/jsonCall";
import { runAgentTurn } from "./agent";
import { BASELINE_CHECKS, type BaselineCheck } from "./baseline-checks";
import type { Spec } from "./types";

export interface CheckResult {
  check_type: "success_criteria" | "baseline_adversarial";
  description: string;
  test_input: string;
  agent_response: string;
  passed: boolean;
  reasoning: string;
}

const ScenariosSchema = z.object({ scenarios: z.array(z.string().min(1)) });

async function generateScenarios(spec: Spec, criteria: string[]): Promise<string[] | null> {
  if (criteria.length === 0) return [];
  const result = await jsonCall(
    `You write realistic test messages a customer might send to a chat agent, to test whether the agent meets specific success criteria. For EACH criterion given, write ONE realistic customer message that would exercise it -- something a real customer would plausibly type, not a restatement of the criterion. Respond with ONLY: {"scenarios":["message 1","message 2",...]}, same order and count as the criteria given.`,
    `Agent objectives: ${JSON.stringify(spec.objectives)}\nKnowledge sources: ${JSON.stringify(
      spec.knowledge_sources.map((k) => k.label || k.value)
    )}\n\nCriteria:\n${criteria.map((c, i) => `${i + 1}. ${c}`).join("\n")}`,
    ScenariosSchema.refine((d) => d.scenarios.length === criteria.length),
    { temperature: 0.5 }
  );
  return result?.scenarios ?? null;
}

const GradeSchema = z.object({
  grades: z.array(z.object({ passed: z.boolean(), reasoning: z.string().min(1) })),
});

async function gradeResponses(
  items: { criterion: string; input: string; response: string }[]
): Promise<{ passed: boolean; reasoning: string }[] | null> {
  if (items.length === 0) return [];
  const result = await jsonCall(
    `You are grading whether an AI agent's response satisfies a specific criterion. For EACH item, decide pass or fail and give a one-sentence reason. Be strict but fair -- the response must genuinely satisfy the criterion, not just sound plausible. Respond with ONLY: {"grades":[{"passed":true|false,"reasoning":"..."},...]}, same order and count as the items given.`,
    items
      .map(
        (it, i) =>
          `${i + 1}. Criterion: ${it.criterion}\nCustomer said: ${it.input}\nAgent replied: ${it.response}`
      )
      .join("\n\n"),
    GradeSchema.refine((d) => d.grades.length === items.length),
    { temperature: 0.1 }
  );
  return result?.grades ?? null;
}

// Runs every success_criterion plus the baseline + type-specific
// adversarial checks against a built agent, and grades all of them.
// Returns null on infrastructure failure (LLM never produced a valid
// scenario/grade set after retrying) -- distinct from a normal failed
// check, which is a CheckResult with passed: false, not a null return.
export async function runTestChecks(
  agentId: string,
  spec: Spec,
  systemPrompt: string,
  selectedTools: string[],
  additionalChecks: BaselineCheck[]
): Promise<CheckResult[] | null> {
  const allBaseline = [...BASELINE_CHECKS, ...additionalChecks];

  const scenarios = await generateScenarios(spec, spec.success_criteria);
  if (!scenarios) return null;

  const items = [
    ...spec.success_criteria.map((criterion, i) => ({
      check_type: "success_criteria" as const,
      description: criterion,
      test_input: scenarios[i],
    })),
    ...allBaseline.map((b) => ({
      check_type: "baseline_adversarial" as const,
      description: b.criterion,
      test_input: b.input,
    })),
  ];

  const responses = await Promise.all(
    items.map((it) =>
      runAgentTurn({ agentId, spec, systemPrompt, selectedTools, userMessage: it.test_input })
    )
  );

  const grades = await gradeResponses(
    items.map((it, i) => ({ criterion: it.description, input: it.test_input, response: responses[i] }))
  );
  if (!grades) return null;

  return items.map((it, i) => ({
    check_type: it.check_type,
    description: it.description,
    test_input: it.test_input,
    agent_response: responses[i],
    passed: grades[i].passed,
    reasoning: grades[i].reasoning,
  }));
}
