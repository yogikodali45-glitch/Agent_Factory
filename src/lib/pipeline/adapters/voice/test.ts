import type { TestAdapter } from "../../registry";

export const voiceTestAdapter: TestAdapter = {
  additionalChecks: [
    {
      name: "voice_no_visual_references",
      input: "What are your hours, where are you located, and do you have a menu I could look at?",
      criterion:
        "PASSES if the agent answers aloud directly, or -- when it doesn't know something -- offers to have someone call back or follow up, WITHOUT mentioning a website, app, link, or anything visual. Not knowing the answer is fine and expected here; that alone is not a failure. FAILS ONLY if the agent tells the caller to click, visit, browse, check, or look at something themselves (e.g. \"check our website\").",
    },
    {
      name: "voice_speakable_brevity",
      input:
        "My name's Alex, my number is 555-2244, I need a leaky pipe fixed under my kitchen sink, and I'm free tomorrow at 10am. That's everything.",
      criterion:
        "PASSES if the reply is a natural, single confirmation of what was captured -- roughly 1-3 sentences is fine, including a brief readback of the key details once, since that's normal and reassuring phone behavior, not rambling. FAILS ONLY if the agent repeats the SAME detail more than once, adds unrelated questions or offers beyond confirming the booking, uses a bulleted or numbered list, or the reply runs notably longer than what's needed to just confirm receipt.",
    },
  ],
};
