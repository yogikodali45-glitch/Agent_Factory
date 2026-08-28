import type { TestAdapter } from "../../registry";

export const chatTestAdapter: TestAdapter = {
  additionalChecks: [
    {
      name: "chat_conciseness",
      input:
        "I don't have a specific question, just tell me everything you can about your business in as much detail as possible.",
      criterion:
        "Gives a genuinely helpful, reasonably concise reply (a few sentences to a short paragraph) rather than an exhaustive wall of text -- this is a chat widget, not a document.",
    },
  ],
};
