import { buildQuestions, defaultSettings } from "@/lib/rag/questions";
import { unauthorizedResponse } from "@/lib/rag/auth";
import { getWorkspaceSummary, saveConfiguration } from "@/lib/rag/store";
import type { WorkspaceSettings } from "@/lib/rag/types";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const unauthorized = unauthorizedResponse(request);
  if (unauthorized) return unauthorized;
  return Response.json({ workspace: getWorkspaceSummary() });
}

export async function POST(request: Request) {
  const unauthorized = unauthorizedResponse(request);
  if (unauthorized) return unauthorized;
  try {
    const body = (await request.json()) as {
      settings?: Partial<WorkspaceSettings>;
      answers?: Record<string, string>;
      questions?: ReturnType<typeof buildQuestions>;
    };
    const incoming = body.settings || {};
    const settings = { ...defaultSettings, ...incoming };
    if (!settings.companyName?.trim() || !settings.industry?.trim() || !settings.useCase?.trim() || !settings.audience?.trim()) {
      return Response.json({ error: "Company name, industry, use case, and audience are required." }, { status: 400 });
    }
    const stringSettings = ["companyName", "companyDescription", "industry", "useCase", "audience", "tone", "responseFormat", "languages", "citationStyle", "conversationMemory", "sensitiveData", "boundaries", "unknownAnswer", "escalation", "model", "embeddingModel", "apiBaseUrl", "chatProvider", "embeddingProvider"] as const;
    for (const key of stringSettings) {
      if (typeof settings[key] !== "string" || settings[key].length > 12000) {
        return Response.json({ error: `${key} must be a text value shorter than 12,000 characters.` }, { status: 400 });
      }
    }
    const normalizedSettings: WorkspaceSettings = {
      ...settings,
      retrievalTopK: Number.isFinite(Number(settings.retrievalTopK)) ? Math.min(12, Math.max(2, Number(settings.retrievalTopK))) : 6,
    };
    const questions = buildQuestions({
      companyName: settings.companyName,
      industry: settings.industry,
      useCase: settings.useCase,
      audience: settings.audience,
    });
    const answers = Object.fromEntries(Object.entries(body.answers || {}).filter(([, value]) => typeof value === "string").map(([key, value]) => [key, value.trim().slice(0, 12000)]));
    const missing = questions.filter((question) => question.required && !answers[question.id]?.trim());
    if (missing.length) return Response.json({ error: `Answer the required question: ${missing[0].label}.` }, { status: 400 });

    const workspace = saveConfiguration(normalizedSettings, questions, answers);
    return Response.json({ workspace });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to save workspace." }, { status: 400 });
  }
}
