import { answerWithModel, createEmbeddings, resolveProviderConfig, serverProviderConfigured, sourceFromChunk, type ProviderConfig } from "@/lib/rag/provider";
import { unauthorizedResponse } from "@/lib/rag/auth";
import { getWorkspaceSummary, searchChunks } from "@/lib/rag/store";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  const unauthorized = unauthorizedResponse(request);
  if (unauthorized) return unauthorized;
  try {
    const body = (await request.json()) as ProviderConfig & { message?: string; history?: Array<{ role: "user" | "assistant"; content: string }> };
    const message = body.message?.trim();
    if (!message) return Response.json({ error: "Ask a question to search the knowledge base." }, { status: 400 });
    if (message.length > 4_000) return Response.json({ error: "Keep questions under 4,000 characters." }, { status: 400 });
    const workspace = getWorkspaceSummary();
    if (!workspace.chunkCount || !workspace.indexedAt) return Response.json({ error: "Upload and build the knowledge index before asking questions." }, { status: 400 });

    let queryEmbedding: number[] | undefined;
    const embeddingConfig = resolveProviderConfig({ ...body, providerId: workspace.settings.embeddingProvider, embeddingModel: workspace.settings.embeddingModel }, "embedding");
    const matchingEmbeddingIndex = Boolean(workspace.searchMode === "hybrid" && workspace.indexedAt && workspace.indexMetadata && workspace.indexMetadata.providerId === embeddingConfig.providerId && workspace.indexMetadata.model === (embeddingConfig.model || embeddingConfig.embeddingModel || workspace.settings.embeddingModel));
    if (matchingEmbeddingIndex && (body.apiKey?.trim() || serverProviderConfigured("embedding"))) {
      try {
        queryEmbedding = (await createEmbeddings([message], embeddingConfig))[0];
      } catch {
        // A provider may support chat but not embeddings. Keyword search remains useful.
      }
    }

    const matches = searchChunks(message, queryEmbedding, workspace.settings.retrievalTopK || 6);
    const sources = matches.map(sourceFromChunk);
    if (!matches.length || matches[0].score < 0.12) {
      return Response.json({
        answer: `I couldn't find that in ${workspace.settings.companyName || "the connected knowledge base"}. ${workspace.settings.unknownAnswer || "Please contact the team for a human answer."}`,
        sources: [],
      });
    }
    if (!body.apiKey?.trim() && !serverProviderConfigured("chat") && workspace.settings.chatProvider !== "ollama") return Response.json({ error: "Add an LLM API key before asking the assistant, or configure a server provider." }, { status: 400 });

    const answer = await answerWithModel(
      message,
      matches.map((match) => ({ content: match.content, documentName: match.documentName })),
      workspace.settings,
      workspace.answers,
      { ...body, providerId: workspace.settings.chatProvider, apiBaseUrl: workspace.settings.apiBaseUrl, model: workspace.settings.model, maxOutputTokens: workspace.settings.maxOutputTokens },
      (body.history || []).filter((turn) => turn && (turn.role === "user" || turn.role === "assistant") && typeof turn.content === "string").slice(-6).map((turn) => ({ role: turn.role, content: turn.content.slice(0, 4_000) })),
    );
    return Response.json({ answer, sources }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "The assistant could not answer right now." }, { status: 502 });
  }
}
