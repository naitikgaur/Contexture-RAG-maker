import { getWorkspaceSummary } from "@/lib/rag/store";
import { accessProtectionEnabled, hasValidAccessToken } from "@/lib/rag/auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const workspace = getWorkspaceSummary();
  const response = {
    status: "ok",
    service: "contexture",
    schemaVersion: workspace.schemaVersion,
    accessRequired: accessProtectionEnabled(),
    timestamp: new Date().toISOString(),
    ...(hasValidAccessToken(request) ? {
      indexed: Boolean(workspace.indexedAt && workspace.chunkCount),
      documents: workspace.documents.length,
      providerConfigured: workspace.providerConfigured,
    } : {}),
  };
  return Response.json(response, { headers: { "Cache-Control": "no-store" } });
}
