import type { z } from "zod";
import { euri, DEFAULT_MODEL } from "./client";

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

// Call + parse + validate + retry-once-on-mismatch, factored out because
// Intake, Build, and now Test's scenario generation and grading all do
// this exact "ask for JSON matching a schema" dance. New call sites use
// this; Intake/Build keep their own already-working copies rather than
// being retrofitted for no functional gain.
export async function jsonCall<T>(
  systemPrompt: string,
  userPrompt: string,
  schema: z.ZodType<T>,
  opts?: { temperature?: number }
): Promise<T | null> {
  // response_format: json_object requires the word "json" to appear
  // somewhere in the messages, or the API rejects the call outright.
  // Guaranteed here so no caller has to remember it.
  const messages: ChatMessage[] = [
    { role: "system", content: `${systemPrompt}\n\nRespond in JSON.` },
    { role: "user", content: userPrompt },
  ];

  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await euri.chat.completions.create({
      model: DEFAULT_MODEL,
      messages,
      response_format: { type: "json_object" },
      temperature: opts?.temperature ?? 0.2,
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

    const result = schema.safeParse(parsedJson);
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
