import type { Chunk } from "./types";

const TARGET_CHARS = 1200;
const OVERLAP_CHARS = 180;
const HARD_MAX_CHARS = 1600;

export function normalizeText(input: string) {
  return input
    .replace(/\u0000/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function splitLongParagraph(paragraph: string): string[] {
  const sentences = paragraph.split(/(?<=[.!?])\s+/);
  const pieces: string[] = [];
  let current = "";

  for (const sentence of sentences) {
    if (sentence.length > HARD_MAX_CHARS) {
      if (current.trim()) pieces.push(current.trim());
      current = "";
      for (let start = 0; start < sentence.length; start += TARGET_CHARS - OVERLAP_CHARS) {
        pieces.push(sentence.slice(start, start + TARGET_CHARS).trim());
      }
      continue;
    }
    if (current && current.length + sentence.length + 1 > TARGET_CHARS) {
      pieces.push(current.trim());
      current = current.slice(Math.max(0, current.length - OVERLAP_CHARS)) + " " + sentence;
    } else {
      current = current ? `${current} ${sentence}` : sentence;
    }
  }

  if (current.trim()) pieces.push(current.trim());
  return pieces.flatMap((piece) => piece.length > HARD_MAX_CHARS ? splitLongParagraph(piece) : [piece]);
}

export function chunkText(text: string, documentId: string, documentName: string): Chunk[] {
  const normalized = normalizeText(text);
  if (!normalized) return [];

  const paragraphs = normalized.split(/\n\s*\n/).map((paragraph) => paragraph.trim()).filter(Boolean);
  const chunks: string[] = [];
  let current = "";

  for (const paragraph of paragraphs) {
    const pieces = paragraph.length > TARGET_CHARS ? splitLongParagraph(paragraph) : [paragraph];
    for (const piece of pieces) {
      if (current && current.length + piece.length + 2 > TARGET_CHARS) {
        chunks.push(current.trim());
        const overlap = current.slice(Math.max(0, current.length - OVERLAP_CHARS));
        current = `${overlap}\n\n${piece}`;
      } else {
        current = current ? `${current}\n\n${piece}` : piece;
      }
    }
  }

  if (current.trim()) chunks.push(current.trim());

  return chunks.flatMap((content) => content.length > HARD_MAX_CHARS ? splitLongParagraph(content) : [content]).map((content, index) => ({
    id: `${documentId}-${index + 1}`,
    documentId,
    documentName,
    content,
    index,
  }));
}
