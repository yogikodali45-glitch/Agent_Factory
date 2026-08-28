import { z } from "zod";

export const SCHEMA_VERSION = 1;

export const KnowledgeSourceSchema = z.object({
  type: z.enum(["url", "document"]),
  value: z.string().min(1),
  label: z.string().optional(),
});

export type KnowledgeSource = z.infer<typeof KnowledgeSourceSchema>;

export const ClarificationEntrySchema = z.object({
  question: z.string().min(1),
  answer: z.string().min(1),
});

// The one object every pipeline stage reads from -- Blueprint §02.
// Intake is the only stage that writes it.
export const SpecSchema = z.object({
  schema_version: z.literal(SCHEMA_VERSION),
  agent_id: z.string().uuid(),
  agent_type: z.string().min(1),

  objectives: z.array(z.string().min(1)).min(1),
  tone: z.string().min(1),
  knowledge_sources: z.array(KnowledgeSourceSchema).default([]),
  required_tools: z.array(z.string().min(1)).default([]),
  constraints: z.array(z.string().min(1)).default([]),
  success_criteria: z.array(z.string().min(1)).min(1),
  escalation_rules: z.array(z.string().min(1)).default([]),

  clarification_log: z.array(ClarificationEntrySchema).default([]),
});

export type Spec = z.infer<typeof SpecSchema>;

// What the LLM extraction call must return -- the Spec's content fields,
// without agent_id/agent_type/schema_version (the route adds those once
// extraction is complete; the model never invents an id).
const SpecContentFields = {
  objectives: z.array(z.string().min(1)).min(1),
  tone: z.string().min(1),
  knowledge_sources: z.array(KnowledgeSourceSchema).default([]),
  required_tools: z.array(z.string().min(1)).default([]),
  constraints: z.array(z.string().min(1)).default([]),
  success_criteria: z.array(z.string().min(1)).min(1),
  escalation_rules: z.array(z.string().min(1)).default([]),
};

export const IntakeExtractionSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("complete"), ...SpecContentFields }),
  z.object({
    status: z.literal("needs_clarification"),
    questions: z.array(z.string().min(1)).min(1).max(5),
  }),
]);

export type IntakeExtraction = z.infer<typeof IntakeExtractionSchema>;

// What Build's LLM call must return. selected_tools is constrained to
// whatever connector ids the type's BuildAdapter actually allows -- built
// per-request, not a static export, since that allow-list is adapter data,
// not a schema constant (Blueprint §03: Build can't select or invent
// anything outside the type's allowed subset).
export function buildResultSchema(allowedConnectorIds: string[]) {
  return z.object({
    system_prompt: z.string().min(1),
    selected_tools: z.array(z.enum(allowedConnectorIds as [string, ...string[]])).default([]),
  });
}

export type BuildResult = z.infer<ReturnType<typeof buildResultSchema>>;
