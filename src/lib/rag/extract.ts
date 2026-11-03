import mammoth from "mammoth";
import pdfParse from "pdf-parse";
import { normalizeText } from "./chunker";

const MAX_FILE_BYTES = 15 * 1024 * 1024;
const MAX_TEXT_CHARACTERS = 2_000_000;
const supportedExtensions = [".txt", ".md", ".markdown", ".csv", ".json", ".html", ".htm", ".pdf", ".docx"];

export function isSupportedFile(name: string) {
  const lower = name.toLowerCase();
  return supportedExtensions.some((extension) => lower.endsWith(extension));
}

function extensionOf(name: string) {
  const match = name.toLowerCase().match(/\.[a-z0-9]+$/);
  return match?.[0] ?? "";
}

export async function extractText(file: File) {
  if (file.size > MAX_FILE_BYTES) {
    throw new Error(`${file.name} is larger than the 15 MB upload limit.`);
  }
  if (!isSupportedFile(file.name)) {
    throw new Error(`${file.name} is not supported. Upload PDF, DOCX, TXT, Markdown, CSV, HTML, or JSON.`);
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  let text = "";
  switch (extensionOf(file.name)) {
    case ".pdf":
      text = (await pdfParse(buffer)).text;
      break;
    case ".docx":
      text = (await mammoth.extractRawText({ buffer })).value;
      break;
    case ".json": {
      const parsed = JSON.parse(buffer.toString("utf8")) as unknown;
      text = JSON.stringify(parsed, null, 2);
      break;
    }
    case ".html":
    case ".htm":
      text = buffer.toString("utf8").replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " ");
      break;
    default:
      text = buffer.toString("utf8");
  }

  const normalized = normalizeText(text);
  if (normalized.length < 20) throw new Error(`${file.name} does not contain enough readable text to index.`);
  if (normalized.length > MAX_TEXT_CHARACTERS) throw new Error(`${file.name} contains more than 2 million readable characters.`);
  return normalized;
}

export const uploadLimits = {
  maxFileBytes: MAX_FILE_BYTES,
  supportedExtensions,
};
