export type WorkspaceStage = "setup" | "knowledge" | "chat";

export type ProviderId =
  | "openai"
  | "anthropic"
  | "groq"
  | "openrouter"
  | "ollama"
  | "mistral"
  | "together"
  | "gemini"
  | "deepseek"
  | "custom";

export type QuestionKind = "text" | "textarea" | "select";

export interface RagQuestion {
  id: string;
  label: string;
  prompt: string;
  kind: QuestionKind;
  required: boolean;
  options?: string[];
  placeholder?: string;
}

export interface WorkspaceSettings {
  companyName: string;
  companyDescription: string;
  industry: string;
  useCase: string;
  audience: string;
  tone: string;
  responseFormat: string;
  languages: string;
  citationStyle: string;
  conversationMemory: string;
  sensitiveData: string;
  boundaries: string;
  unknownAnswer: string;
  escalation: string;
  retrievalTopK: number;
  chatProvider: ProviderId;
  embeddingProvider: ProviderId;
  maxOutputTokens: number;
  model: string;
  embeddingModel: string;
  apiBaseUrl: string;
}

export interface Chunk {
  id: string;
  documentId: string;
  documentName: string;
  content: string;
  index: number;
  embedding?: number[];
}

export interface StoredDocument {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  uploadedAt: string;
  characterCount: number;
  chunks: Chunk[];
}

export interface WorkspaceData {
  schemaVersion: number;
  id: string;
  createdAt: string;
  updatedAt: string;
  settings: WorkspaceSettings;
  questions: RagQuestion[];
  answers: Record<string, string>;
  documents: StoredDocument[];
  indexedAt: string | null;
  searchMode: "keyword" | "hybrid";
  indexMetadata: IndexMetadata | null;
  publishedRelease: PublishedRelease | null;
}

export interface IndexMetadata {
  providerId: ProviderId;
  model: string;
  dimensions: number | null;
  chunkSetHash: string;
  builtAt: string;
}

export interface PublishedRelease {
  id: string;
  slug: string;
  publishedAt: string;
  settings: WorkspaceSettings;
  answers: Record<string, string>;
  documents: StoredDocument[];
  indexedAt: string;
  searchMode: WorkspaceData["searchMode"];
  indexMetadata: IndexMetadata | null;
}

export interface WorkspaceSummary {
  id: string;
  schemaVersion: number;
  providerConfigured: boolean;
  settings: WorkspaceSettings;
  questions: RagQuestion[];
  answers: Record<string, string>;
  documents: Array<Pick<StoredDocument, "id" | "name" | "mimeType" | "size" | "uploadedAt" | "characterCount"> & { chunkCount: number }>;
  indexedAt: string | null;
  searchMode: WorkspaceData["searchMode"];
  chunkCount: number;
  indexMetadata: IndexMetadata | null;
  published: { slug: string; publishedAt: string; indexedAt: string } | null;
}

export interface ChatSource {
  id: string;
  documentName: string;
  snippet: string;
  score: number;
}

export interface RetrievedChunk extends Chunk {
  score: number;
}
