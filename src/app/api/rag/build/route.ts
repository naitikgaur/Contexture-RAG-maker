import { createEmbeddings, resolveProviderConfig, serverProviderConfigured, type ProviderConfig } from "@/lib/rag/provider";
import { unauthorizedResponse } from "@/lib/rag/auth";
import { allChunks, markKeywordIndex, replaceEmbeddings } from "@/lib/rag/store";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: Request) {
  const unauthorized = unauthorizedResponse(request);
  if (unauthorized) return unauthorized;
  try {
    const body = ((await request.json().catch(() => ({}))) || {}) as ProviderConfig;
    const chunks = allChunks();
    if (!chunks.length) return Response.json({ error: "Upload at least one readable document before building the index." }, { status: 400 });

    let embeddingError = "";
    const embeddings: Array<{ id: string; embedding: number[] }> = [];
    if (body.apiKey?.trim() || serverProviderConfigured("embedding")) {
      try {
        const batchSize = 48;
        for (let start = 0; start < chunks.length; start += batchSize) {
          const batch = chunks.slice(start, start + batchSize);
          const vectors = await createEmbeddings(batch.map((chunk) => chunk.content), body);
          embeddings.push(...batch.map((chunk, index) => ({ id: chunk.id, embedding: vectors[index] })));
        }
      } catch (error) {
        embeddingError = error instanceof Error ? error.message : "Embeddings were unavailable.";
        embeddings.length = 0;
      }
    }

    const workspace = embeddings.length
      ? replaceEmbeddings(embeddings, {
        providerId: resolveProviderConfig(body, "embedding").providerId,
        model: body.embeddingModel || process.env.RAG_EMBEDDING_MODEL || "text-embedding-3-small",
      })
      : markKeywordIndex();
    return Response.json({ workspace, embeddingError, message: embeddings.length ? "Hybrid index ready." : "Keyword index ready." });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not build the index." }, { status: 400 });
  }
}
