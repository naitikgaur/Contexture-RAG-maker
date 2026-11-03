import { unauthorizedResponse } from "@/lib/rag/auth";
import { serverProviderConfigured } from "@/lib/rag/provider";
import { publishWorkspace } from "@/lib/rag/store";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const unauthorized = unauthorizedResponse(request);
  if (unauthorized) return unauthorized;
  if (!serverProviderConfigured("chat")) {
    return Response.json({ error: "Configure a server-side chat provider before publishing a public assistant." }, { status: 400 });
  }
  try {
    const body = (await request.json().catch(() => ({}))) as { slug?: string };
    const workspace = publishWorkspace(body.slug);
    return Response.json({ workspace, publicUrl: `/chat/${workspace.published?.slug}` }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not publish the assistant." }, { status: 400 });
  }
}
