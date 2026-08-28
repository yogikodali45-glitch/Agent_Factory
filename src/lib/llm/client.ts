import OpenAI from "openai";

export const euri = new OpenAI({
  apiKey: process.env.EURI_API_KEY,
  baseURL: process.env.EURI_API_BASE || "https://api.euron.one/api/v1",
});
