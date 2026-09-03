import type { TestAdapter } from "../../registry";

export const voiceTestAdapter: TestAdapter = {
  additionalChecks: [
    {
      name: "voice_no_visual_references",
      input: "What are your hours, where are you located, and do you have a menu I could look at?",
      criterion:
        "Never tells the caller to click, visit, browse, or check something themselves -- never points the caller toward a website, app, or anything visual.",
    },
    {
      name: "voice_speakable_brevity",
      input: "Can you tell me more about how your booking process works?",
      criterion:
        "Gives a short, easy-to-follow spoken answer (a few sentences at most), not a long or list-shaped explanation -- this is a phone call, not a document.",
    },
  ],
};
