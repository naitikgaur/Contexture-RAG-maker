import { answerWithModel, createEmbeddings, resolveProviderConfig, serverProviderConfigured, sourceFromChunk } from "@/lib/rag/provider";
import { getPublishedRelease, searchChunks } from "@/lib/rag/store";

export const runtime = "nodejs";
export const maxDuration = 60;

const requestWindowMs = 60_000;
const maxRequestsPerWindow = 30;
const requestCounts = new Map<string, { startedAt: number; count: number }>();

function clientKey(request: Request) {
  return (request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "anonymous").split(",")[0].trim().slice(0, 100);
}

function rateLimited(request: Request) {
  const now = Date.now();
  const key = clientKey(request);
  const current = requestCounts.get(key);
  if (!current || now - current.startedAt > requestWindowMs) {
    requestCounts.set(key, { startedAt: now, count: 1 });
    return false;
  }
  current.count += 1;
  return current.count > maxRequestsPerWindow;
}

function releaseFor(request: Request) {
  const slug = new URL(request.url).searchParams.get("slug")?.trim() || "";
  return slug && /^[a-z0-9][a-z0-9-]{1,79}$/.test(slug) ? getPublishedRelease(slug) : null;
}

export async function GET(request: Request) {
  const release = releaseFor(request);
  if (!release) return Response.json({ error: "Published assistant not found." }, { status: 404 });
  return Response.json({
    slug: release.slug,
    companyName: release.settings.companyName,
    companyDescription: release.settings.companyDescription,
    audience: release.settings.audience,
    publishedAt: release.publishedAt,
    citationStyle: release.settings.citationStyle,
  }, { headers: { "Cache-Control": "public, max-age=60" } });
}

export async function POST(request: Request) {
  if (rateLimited(request)) return Response.json({ error: "Too many questions. Please wait a minute and try again." }, { status: 429, headers: { "Retry-After": "60" } });
  try {
    const body = (await request.json()) as { slug?: string; message?: string; history?: Array<{ role: "user" | "assistant"; content: string }> };
    const slug = body.slug?.trim() || "";
    const release = slug && /^[a-z0-9][a-z0-9-]{1,79}$/.test(slug) ? getPublishedRelease(slug) : null;
    if (!release) return Response.json({ error: "Published assistant not found." }, { status: 404 });
    const message = body.message?.trim() || "";
    if (!message) return Response.json({ error: "Ask a question." }, { status: 400 });
    if (message.length > 4_000) return Response.json({ error: "Keep questions under 4,000 characters." }, { status: 400 });
    if (!serverProviderConfigured("chat")) return Response.json({ error: "This assistant is not connected to a server-side model yet." }, { status: 503 });

    let queryEmbedding: number[] | undefined;
    const embeddingConfig = resolveProviderConfig({ providerId: release.settings.embeddingProvider, embeddingModel: release.settings.embeddingModel }, "embedding");
    const matchingEmbeddingIndex = Boolean(release.indexMetadata && release.indexMetadata.providerId === embeddingConfig.providerId && release.indexMetadata.model === (embeddingConfig.model || embeddingConfig.embeddingModel || release.settings.embeddingModel));
    if (release.searchMode === "hybrid" && matchingEmbeddingIndex && serverProviderConfigured("embedding")) {
      try {
        queryEmbedding = (await createEmbeddings([message], embeddingConfig))[0];
      } catch {
        // Public chat still works with lexical retrieval if the embedding service is unavailable.
      }
    }
    const chunks = release.documents.flatMap((document) => document.chunks);
    const matches = searchChunks(message, queryEmbedding, release.settings.retrievalTopK || 6, chunks);
    const sources = matches.map(sourceFromChunk);
    if (!matches.length || matches[0].score < 0.12) {
      return Response.json({ answer: `I couldn't find that in ${release.settings.companyName || "the knowledge base"}. ${release.settings.unknownAnswer || "Please contact the team for a human answer."}`, sources: [] }, { headers: { "Cache-Control": "no-store" } });
    }
    const answer = await answerWithModel(
      message,
      matches.map((match) => ({ content: match.content, documentName: match.documentName })),
      release.settings,
      release.answers,
      { providerId: release.settings.chatProvider },
      (body.history || []).filter((turn) => turn && (turn.role === "user" || turn.role === "assistant") && typeof turn.content === "string").slice(-6).map((turn) => ({ role: turn.role, content: turn.content.slice(0, 4_000) })),
    );
    return Response.json({ answer, sources }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "The assistant could not answer right now." }, { status: 502 });
  }
}
