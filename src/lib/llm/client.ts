import OpenAI from "openai";

export const euri = new OpenAI({
  apiKey: process.env.EURI_API_KEY,
  baseURL: process.env.EURI_API_BASE || "https://api.euron.one/api/v1/euri",
});

// Free-tier model (10k tokens/day). Swap per call once a stage needs a
// stronger model — never rely on this as anything but a cheap default.
export const DEFAULT_MODEL = process.env.EURI_DEFAULT_MODEL || "gpt-4o-mini";

// 1536-dimensional, free-tier eligible on Euri. If this ever changes,
// the knowledge_chunks.embedding column (vector(1536)) has to change too.
export const EMBEDDING_MODEL = "text-embedding-3-small";
