import type { IntakeAdapter } from "../../registry";

export const chatIntakeAdapter: IntakeAdapter = {
  promptGuidance: `This request is for a CHAT agent: a text-based assistant embedded on the
business's website or reached through an API, talking to their customers.

- objectives: what the agent should do for a customer, in plain terms
  (e.g. "answer questions about store hours", "let customers book a
  haircut"). Do not invent objectives the requester didn't state or
  clearly imply.
- knowledge_sources: only include a source if the requester named one
  (a URL, a document, "our FAQ page"). If the agent clearly needs
  knowledge to do what they described but no source was given, that is
  a genuine gap -- ask for it, don't leave knowledge_sources empty and
  move on.
- required_tools: capture the *concept* the requester wants (e.g.
  "booking", "escalate to a human") in plain words. Do not try to match
  it to a specific connector or product name -- that happens later, in
  Build.
- tone: if not stated, default to "friendly and professional" rather
  than asking -- this is rarely worth blocking on.
- success_criteria: derive 2-4 concrete, testable statements from the
  objectives yourself (e.g. "correctly answers a representative
  question about store hours from the knowledge source", "completes a
  booking request end to end when asked"). Never ask the requester to
  write these themselves -- that is the platform's job, not theirs.`,
};
