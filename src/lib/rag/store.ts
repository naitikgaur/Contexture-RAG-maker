import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { chunkText } from "./chunker";
import { defaultSettings } from "./questions";
import { serverProviderConfigured } from "./provider";
import type { IndexMetadata, PublishedRelease, RetrievedChunk, StoredDocument, WorkspaceData, WorkspaceSettings, WorkspaceSummary } from "./types";

const dataDirectory = path.join(process.cwd(), ".data");
const dataFile = path.join(dataDirectory, "rag-workspace.json");
const CURRENT_SCHEMA_VERSION = 3;

type PersistedState = { workspace: WorkspaceData };

declare global {
  var __ragWorkspace: WorkspaceData | undefined;
}

function initialWorkspace(): WorkspaceData {
  const now = new Date().toISOString();
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    id: "workspace-local",
    createdAt: now,
    updatedAt: now,
    settings: { ...defaultSettings },
    questions: [],
    answers: {},
    documents: [],
    indexedAt: null,
    searchMode: "keyword",
    indexMetadata: null,
    publishedRelease: null,
  };
}

function readWorkspace() {
  if (globalThis.__ragWorkspace) return globalThis.__ragWorkspace;
  if (fs.existsSync(dataFile)) {
    try {
      const persistedText = fs.readFileSync(dataFile, "utf8").replace(/^\uFEFF/, "");
      const parsed = JSON.parse(persistedText) as PersistedState;
      const initial = initialWorkspace();
      const loaded = parsed.workspace || (parsed as unknown as WorkspaceData);
      globalThis.__ragWorkspace = {
        ...initial,
        ...loaded,
        schemaVersion: CURRENT_SCHEMA_VERSION,
        settings: { ...initial.settings, ...(loaded.settings || {}) },
        questions: Array.isArray(loaded.questions) ? loaded.questions : [],
        answers: loaded.answers && typeof loaded.answers === "object" ? loaded.answers : {},
        documents: Array.isArray(loaded.documents) ? loaded.documents : [],
        indexMetadata: loaded.indexMetadata || null,
        publishedRelease: loaded.publishedRelease || null,
      };
      return globalThis.__ragWorkspace;
    } catch (error) {
      throw new Error(`Workspace storage is unreadable. Restore .data/rag-workspace.json from backup before continuing. ${error instanceof Error ? error.message : "Invalid JSON."}`);
    }
  }
  globalThis.__ragWorkspace = initialWorkspace();
  return globalThis.__ragWorkspace;
}

function writeWorkspace(workspace: WorkspaceData) {
  workspace.updatedAt = new Date().toISOString();
  workspace.schemaVersion = CURRENT_SCHEMA_VERSION;
  globalThis.__ragWorkspace = workspace;
  fs.mkdirSync(dataDirectory, { recursive: true });
  const temporaryDataFile = `${dataFile}.${process.pid}.${randomUUID()}.tmp`;
  if (fs.existsSync(dataFile)) fs.copyFileSync(dataFile, `${dataFile}.bak`);
  fs.writeFileSync(temporaryDataFile, JSON.stringify({ workspace }, null, 2), "utf8");
  fs.renameSync(temporaryDataFile, dataFile);
}

export function getWorkspaceSummary(): WorkspaceSummary {
  const workspace = readWorkspace();
  const visibleSettings = {
    ...workspace.settings,
    apiBaseUrl: process.env.RAG_CHAT_BASE_URL?.trim() || process.env.RAG_PROVIDER_BASE_URL?.trim() || workspace.settings.apiBaseUrl,
    chatProvider: (process.env.RAG_CHAT_PROVIDER || process.env.RAG_PROVIDER || workspace.settings.chatProvider) as WorkspaceSettings["chatProvider"],
    embeddingProvider: (process.env.RAG_EMBEDDING_PROVIDER || process.env.RAG_PROVIDER || workspace.settings.embeddingProvider) as WorkspaceSettings["embeddingProvider"],
    model: process.env.RAG_CHAT_MODEL?.trim() || workspace.settings.model,
    embeddingModel: process.env.RAG_EMBEDDING_MODEL?.trim() || workspace.settings.embeddingModel,
  };
  return {
    id: workspace.id,
    schemaVersion: workspace.schemaVersion,
    providerConfigured: serverProviderConfigured("chat"),
    settings: visibleSettings,
    questions: workspace.questions,
    answers: workspace.answers,
    documents: workspace.documents.map(({ id, name, mimeType, size, uploadedAt, characterCount, chunks }) => ({
      id,
      name,
      mimeType,
      size,
      uploadedAt,
      characterCount,
      chunkCount: chunks.length,
    })),
    indexedAt: workspace.indexedAt,
    searchMode: workspace.searchMode,
    indexMetadata: workspace.indexMetadata,
    chunkCount: workspace.documents.reduce((count, document) => count + document.chunks.length, 0),
    published: workspace.publishedRelease ? { slug: workspace.publishedRelease.slug, publishedAt: workspace.publishedRelease.publishedAt, indexedAt: workspace.publishedRelease.indexedAt } : null,
  };
}

export function saveConfiguration(settings: WorkspaceSettings, questions: WorkspaceData["questions"], answers: Record<string, string>) {
  const workspace = readWorkspace();
  workspace.settings = { ...workspace.settings, ...settings };
  workspace.questions = questions;
  workspace.answers = answers;
  workspace.settings.boundaries = workspace.settings.boundaries || "Only answer from the connected knowledge base and be honest about uncertainty.";
  workspace.settings.unknownAnswer = workspace.answers["unknown-answer"] || workspace.settings.unknownAnswer;
  workspace.settings.escalation = workspace.answers["escalation-contact"] || workspace.settings.escalation;
  workspace.settings.companyDescription = workspace.answers["company-description"] || workspace.settings.companyDescription;
  workspace.settings.responseFormat = workspace.answers["response-format"] || workspace.settings.responseFormat;
  workspace.settings.languages = workspace.answers.languages || workspace.settings.languages;
  workspace.settings.citationStyle = workspace.answers["citation-style"] || workspace.settings.citationStyle;
  workspace.settings.conversationMemory = workspace.answers["memory-policy"] || workspace.settings.conversationMemory;
  workspace.settings.sensitiveData = workspace.answers["sensitive-data"] || workspace.settings.sensitiveData;
  workspace.indexedAt = null;
  workspace.searchMode = "keyword";
  workspace.indexMetadata = null;
  writeWorkspace(workspace);
  return getWorkspaceSummary();
}

export function addDocument(name: string, mimeType: string, size: number, text: string) {
  const workspace = readWorkspace();
  const documentId = randomUUID();
  const cleanName = name.replace(/[\\/\u0000]/g, "-").trim().slice(0, 180) || "untitled-document";
  const document: StoredDocument = {
    id: documentId,
    name: cleanName,
    mimeType,
    size,
    uploadedAt: new Date().toISOString(),
    characterCount: text.length,
    chunks: chunkText(text, documentId, cleanName),
  };
  const replacing = workspace.documents.some((item) => item.name === cleanName);
  if (!replacing && workspace.documents.length >= 500) throw new Error("This workspace can contain at most 500 documents.");
  workspace.documents = [...workspace.documents.filter((item) => item.name !== cleanName), document];
  workspace.indexedAt = null;
  workspace.searchMode = "keyword";
  workspace.indexMetadata = null;
  writeWorkspace(workspace);
  return getWorkspaceSummary();
}

export function removeDocument(id: string) {
  const workspace = readWorkspace();
  workspace.documents = workspace.documents.filter((document) => document.id !== id);
  workspace.indexedAt = null;
  workspace.searchMode = "keyword";
  workspace.indexMetadata = null;
  writeWorkspace(workspace);
  return getWorkspaceSummary();
}

export function allChunks() {
  return readWorkspace().documents.flatMap((document) => document.chunks);
}

function chunkSetHash(chunks: Array<{ id: string; content: string }>) {
  return createHash("sha256").update(chunks.map((chunk) => `${chunk.id}:${chunk.content}`).join("\n")).digest("hex");
}

export function replaceEmbeddings(embeddings: Array<{ id: string; embedding: number[] }>, metadata?: Omit<IndexMetadata, "chunkSetHash" | "builtAt" | "dimensions">) {
  const workspace = readWorkspace();
  const byId = new Map(embeddings.map((item) => [item.id, item.embedding]));
  for (const document of workspace.documents) {
    for (const chunk of document.chunks) {
      const embedding = byId.get(chunk.id);
      if (embedding) chunk.embedding = embedding;
      else delete chunk.embedding;
    }
  }
  workspace.indexedAt = new Date().toISOString();
  workspace.searchMode = embeddings.length ? "hybrid" : "keyword";
  workspace.indexMetadata = embeddings.length ? {
    providerId: metadata?.providerId || "openai",
    model: metadata?.model || workspace.settings.embeddingModel,
    dimensions: embeddings[0]?.embedding.length || null,
    chunkSetHash: chunkSetHash(allChunks()),
    builtAt: workspace.indexedAt,
  } : null;
  writeWorkspace(workspace);
  return getWorkspaceSummary();
}

export function markKeywordIndex() {
  const workspace = readWorkspace();
  for (const chunk of allChunks()) delete chunk.embedding;
  workspace.indexedAt = new Date().toISOString();
  workspace.searchMode = "keyword";
  workspace.indexMetadata = null;
  writeWorkspace(workspace);
  return getWorkspaceSummary();
}

function cloneRelease(workspace: WorkspaceData, slug: string): PublishedRelease {
  return JSON.parse(JSON.stringify({
    id: randomUUID(),
    slug,
    publishedAt: new Date().toISOString(),
    settings: workspace.settings,
    answers: workspace.answers,
    documents: workspace.documents,
    indexedAt: workspace.indexedAt,
    searchMode: workspace.searchMode,
    indexMetadata: workspace.indexMetadata,
  })) as PublishedRelease;
}

export function publishWorkspace(slugInput?: string) {
  const workspace = readWorkspace();
  if (!workspace.indexedAt || !workspace.documents.length || !workspace.documents.some((document) => document.chunks.length)) {
    throw new Error("Build a completed index before publishing the assistant.");
  }
  const slug = (slugInput || workspace.publishedRelease?.slug || `${workspace.settings.companyName || "assistant"}-${randomUUID().slice(0, 8)}`)
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
  if (!slug) throw new Error("Choose a valid public assistant slug.");
  workspace.publishedRelease = cloneRelease(workspace, slug);
  writeWorkspace(workspace);
  return getWorkspaceSummary();
}

export function getPublishedRelease(slug: string) {
  const release = readWorkspace().publishedRelease;
  return release && release.slug === slug ? release : null;
}

function tokenize(value: string) {
  return new Set(value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").split(/\s+/).filter((token) => token.length > 2));
}

function keywordScore(query: string, content: string) {
  const queryTokens = tokenize(query);
  const contentTokens = tokenize(content);
  if (!queryTokens.size || !contentTokens.size) return 0;
  let overlap = 0;
  for (const token of queryTokens) if (contentTokens.has(token)) overlap += 1;
  const phraseBonus = content.toLowerCase().includes(query.toLowerCase().trim()) ? 0.35 : 0;
  return Math.min(1, overlap / queryTokens.size + phraseBonus);
}

function cosineSimilarity(a: number[], b: number[]) {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let aMagnitude = 0;
  let bMagnitude = 0;
  for (let index = 0; index < a.length; index += 1) {
    dot += a[index] * b[index];
    aMagnitude += a[index] ** 2;
    bMagnitude += b[index] ** 2;
  }
  return aMagnitude && bMagnitude ? dot / (Math.sqrt(aMagnitude) * Math.sqrt(bMagnitude)) : 0;
}

export function searchChunks(query: string, queryEmbedding?: number[], limit = 6, sourceChunks = allChunks()): RetrievedChunk[] {
  const chunks = sourceChunks;
  return chunks
    .map((chunk) => {
      const lexical = keywordScore(query, chunk.content);
      const semantic = queryEmbedding && chunk.embedding ? Math.max(0, cosineSimilarity(queryEmbedding, chunk.embedding)) : 0;
      const score = queryEmbedding && chunk.embedding ? semantic * 0.72 + lexical * 0.28 : lexical;
      return { ...chunk, score };
    })
    .filter((chunk) => chunk.score > 0.03)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
