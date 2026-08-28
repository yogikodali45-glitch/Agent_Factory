import * as cheerio from "cheerio";
import type { KnowledgeSource } from "./types";

export interface ExtractedSource {
  label: string;
  text: string;
}

async function extractUrl(source: KnowledgeSource): Promise<ExtractedSource> {
  const res = await fetch(source.value, {
    headers: { "User-Agent": "AgentFactory/0.1 (+assemble-stage)" },
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch ${source.value}: HTTP ${res.status}`);
  }
  const html = await res.text();
  const $ = cheerio.load(html);
  $("script, style, nav, header, footer, noscript, svg").remove();
  const text = $("body")
    .text()
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n\n")
    .trim();
  return { label: source.label || source.value, text };
}

function extractDocument(source: KnowledgeSource): ExtractedSource {
  return { label: source.label || "document", text: source.value.trim() };
}

// Source-type-specific handling lives here, not in a registry adapter --
// url vs. document is a property of the knowledge_source, not of the
// agent_type, so there's nothing for a type's adapter to customize.
export async function extractSource(source: KnowledgeSource): Promise<ExtractedSource> {
  if (source.type === "url") return extractUrl(source);
  return extractDocument(source);
}

// Simple paragraph-based chunker: keep whole paragraphs together up to
// maxChars, hard-split anything that's still too long on its own.
export function chunkText(text: string, maxChars = 800): string[] {
  const paragraphs = text
    .split(/\n\s*\n+/)
    .map((p) => p.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  let current = "";

  const flush = () => {
    if (current) chunks.push(current);
    current = "";
  };

  for (const p of paragraphs) {
    const candidate = current ? `${current}\n\n${p}` : p;
    if (candidate.length > maxChars && current) {
      flush();
      current = p;
    } else {
      current = candidate;
    }
    while (current.length > maxChars) {
      chunks.push(current.slice(0, maxChars));
      current = current.slice(maxChars);
    }
  }
  flush();
  return chunks;
}
