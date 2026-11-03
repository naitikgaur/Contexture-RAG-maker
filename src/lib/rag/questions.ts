import type { RagQuestion, WorkspaceSettings } from "./types";

const commonQuestions: RagQuestion[] = [
  {
    id: "knowledge-scope",
    label: "Knowledge scope",
    prompt: "What should this assistant know, and what must it never use or discuss?",
    kind: "textarea",
    required: true,
    placeholder: "For example: answer from our approved product, policy, and support docs; never use personal customer records.",
  },
  {
    id: "response-format",
    label: "Response format",
    prompt: "How should a high-quality answer be structured?",
    kind: "textarea",
    required: true,
    placeholder: "For example: give the answer first, then bullets for steps, then a source list.",
  },
  {
    id: "languages",
    label: "Languages",
    prompt: "Which languages should the assistant understand and answer in?",
    kind: "text",
    required: true,
    placeholder: "For example: English and Hindi; reply in the language used by the person.",
  },
  {
    id: "citation-style",
    label: "Citations",
    prompt: "How visible should citations be in the final answer?",
    kind: "select",
    required: true,
    options: ["Inline citations after claims", "A short Sources section", "Both inline citations and a Sources section"],
  },
  {
    id: "memory-policy",
    label: "Conversation memory",
    prompt: "What may the assistant remember during a conversation?",
    kind: "select",
    required: true,
    options: ["No memory beyond the current question", "Remember this browser session only", "Remember only details the user explicitly asks it to remember"],
  },
  {
    id: "sensitive-data",
    label: "Sensitive data",
    prompt: "Could documents or questions contain personal, confidential, regulated, or secret information?",
    kind: "textarea",
    required: true,
    placeholder: "For example: customer contact details and contract terms; never repeat secrets or full payment data.",
  },
  {
    id: "forbidden-topics",
    label: "Forbidden topics",
    prompt: "What topics, actions, or claims must always be refused or escalated?",
    kind: "textarea",
    required: true,
    placeholder: "For example: legal conclusions, medical diagnosis, security credentials, or promises on behalf of the company.",
  },
  {
    id: "document-updates",
    label: "Document updates",
    prompt: "How will the knowledge base be kept current, and which documents are authoritative?",
    kind: "textarea",
    required: true,
    placeholder: "For example: operations uploads approved policies monthly; the newest dated policy wins.",
  },
  {
    id: "source-priority",
    label: "Source priority",
    prompt: "When two documents disagree, which source should win?",
    kind: "textarea",
    required: true,
    placeholder: "For example: the latest approved policy, then the employee handbook, then older documents.",
  },
  {
    id: "unknown-answer",
    label: "Unknown answers",
    prompt: "What should the assistant say when the answer is not in your documents?",
    kind: "textarea",
    required: true,
    placeholder: "For example: say you do not know and route the person to our support inbox.",
  },
  {
    id: "escalation-contact",
    label: "Human handoff",
    prompt: "Who should the assistant point people to when a human needs to step in?",
    kind: "text",
    required: true,
    placeholder: "team@company.com or your support portal URL",
  },
];

export function buildQuestions(profile: Pick<RagQuestionProfile, "companyName" | "industry" | "useCase" | "audience">): RagQuestion[] {
  const questions: RagQuestion[] = [
    {
      id: "company-description",
      label: "Company context",
      prompt: `In one or two sentences, what does ${profile.companyName || "your company"} do and what should the assistant understand about it?`,
      kind: "textarea",
      required: true,
      placeholder: "Describe the product, team, customers, and the context people need to get useful answers.",
    },
    {
      id: "answer-depth",
      label: "Answer depth",
      prompt: `How much detail should your ${profile.useCase || "company"} assistant give to ${profile.audience || "users"}?`,
      kind: "select",
      required: true,
      options: ["Concise — answer in 1–3 sentences", "Helpful — explain the why and next step", "Expert — include detail, caveats, and examples"],
    },
    {
      id: "allowed-actions",
      label: "Allowed actions",
      prompt: "What can the assistant do beyond answering questions?",
      kind: "textarea",
      required: true,
      placeholder: "For example: draft replies and link to forms, but never approve refunds or change account data.",
    },
  ];

  const industry = profile.industry.toLowerCase();
  const useCase = profile.useCase.toLowerCase();

  if (industry.includes("health") || industry.includes("medical")) {
    questions.push({
      id: "safety-boundary",
      label: "Safety boundary",
      prompt: "What must the assistant never diagnose, recommend, or decide?",
      kind: "textarea",
      required: true,
      placeholder: "For example: never diagnose, prescribe, or replace a licensed professional.",
    });
  } else if (industry.includes("finance") || industry.includes("legal")) {
    questions.push({
      id: "disclaimer",
      label: "Required disclaimer",
      prompt: "What disclaimer should appear on regulated or high-stakes answers?",
      kind: "textarea",
      required: true,
      placeholder: "For example: this is general information, not financial or legal advice.",
    });
  } else if (useCase.includes("support") || useCase.includes("customer")) {
    questions.push({
      id: "support-hours",
      label: "Support hours",
      prompt: "When are humans available, and what should happen outside those hours?",
      kind: "text",
      required: true,
      placeholder: "Mon–Fri, 9am–6pm ET. Outside hours, collect an email and set expectations.",
    });
  } else {
    questions.push({
      id: "success-definition",
      label: "A great answer",
      prompt: "What makes an answer genuinely useful to your team?",
      kind: "textarea",
      required: true,
      placeholder: "For example: include the exact policy name, a practical next step, and a link when available.",
    });
  }

  return [...questions, ...commonQuestions];
}

export interface RagQuestionProfile {
  companyName: string;
  industry: string;
  useCase: string;
  audience: string;
}

export const defaultSettings: WorkspaceSettings = {
  companyName: "",
  companyDescription: "",
  industry: "",
  useCase: "",
  audience: "",
  tone: "Clear and human",
  responseFormat: "Answer directly, then give practical next steps and cite the source.",
  languages: "Answer in the language used by the person.",
  citationStyle: "Inline citations after claims",
  conversationMemory: "No memory beyond the current question",
  sensitiveData: "Treat confidential and personal information as sensitive. Do not expose secrets.",
  boundaries: "Only answer from the connected knowledge base. Never invent policies, prices, timelines, or commitments.",
  unknownAnswer: "Say you cannot find the answer in the knowledge base and suggest a human handoff.",
  escalation: "",
  retrievalTopK: 6,
  chatProvider: "openai",
  embeddingProvider: "openai",
  maxOutputTokens: 700,
  model: "gpt-4o-mini",
  embeddingModel: "text-embedding-3-small",
  apiBaseUrl: "https://api.openai.com/v1",
};
