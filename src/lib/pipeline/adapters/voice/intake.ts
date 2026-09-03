import type { IntakeAdapter } from "../../registry";

export const voiceIntakeAdapter: IntakeAdapter = {
  promptGuidance: `This request is for a VOICE agent: a phone-based assistant that answers
an inbound call and talks with customers out loud, in real time. There is
no screen, no text, nothing to click.

- objectives: same idea as chat -- what the agent should do for a caller.
  Do not invent objectives the requester didn't state or clearly imply.
- knowledge_sources: same rule as chat. If an objective implies something
  inherently visual (a menu with photos, a map, a form to fill out), that
  is a real gap specific to this channel -- ask how it should work over
  the phone instead of leaving it unaddressed.
- required_tools: capture the *concept* the requester wants, in plain
  words. Matching it to a specific connector happens later, in Build.
- tone: if not stated, default to "friendly and professional" rather
  than asking -- rarely worth blocking on.
- success_criteria: derive 2-4 concrete, testable statements yourself,
  phrased as things the agent SAYS or DOES on a call -- never as
  something shown, sent, clicked, or displayed. Never ask the requester
  to write these themselves.`,
};
