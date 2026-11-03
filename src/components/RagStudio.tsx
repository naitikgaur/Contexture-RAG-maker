"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { buildQuestions, defaultSettings } from "@/lib/rag/questions";
import { providerProfiles } from "@/lib/rag/provider";
import type { ChatSource, RagQuestion, WorkspaceSettings, WorkspaceStage, WorkspaceSummary } from "@/lib/rag/types";

type ChatItem = { role: "assistant" | "user"; content: string; sources?: ChatSource[] };

const industryOptions = ["Software & technology", "Healthcare", "Financial services", "Legal services", "Education", "E-commerce", "Professional services", "Other"];
const useCaseOptions = ["Customer support", "Employee knowledge", "Sales enablement", "Operations & SOPs", "Research assistant", "Product documentation", "Something else"];
const audienceOptions = ["Customers", "Employees", "Sales team", "Partners", "Students", "My whole company"];

const initialChat: ChatItem = {
  role: "assistant",
  content: "Your knowledge base is ready. Ask a question and I’ll answer from your documents with the sources I used.",
};

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function dateLabel(value: string | null) {
  if (!value) return "Not indexed yet";
  return `Indexed ${new Intl.DateTimeFormat("en", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value))}`;
}

function errorMessage(payload: { error?: string }, fallback: string) {
  return payload.error || fallback;
}

function authHeaders(token: string): HeadersInit {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function readWorkspace(token: string) {
  const response = await fetch("/api/rag/workspace", { headers: authHeaders(token) });
  const data = (await response.json().catch(() => ({}))) as { workspace?: WorkspaceSummary; error?: string };
  return { response, data };
}

type IconName = "arrow-left" | "arrow-right" | "arrow-up" | "check" | "chevron" | "close" | "external" | "lock" | "shield" | "spark" | "upload";

function Icon({ name, size = 16 }: { name: IconName; size?: number }) {
  const common = { className: "ui-icon", width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  if (name === "check") return <svg {...common}><path d="m5 12 4.2 4.2L19 6.5" /></svg>;
  if (name === "close") return <svg {...common}><path d="m6 6 12 12M18 6 6 18" /></svg>;
  if (name === "arrow-left") return <svg {...common}><path d="M19 12H5M11 18l-6-6 6-6" /></svg>;
  if (name === "arrow-right") return <svg {...common}><path d="M5 12h14M13 6l6 6-6 6" /></svg>;
  if (name === "arrow-up") return <svg {...common}><path d="M12 19V5m-6 6 6-6 6 6" /></svg>;
  if (name === "chevron") return <svg {...common}><path d="m6 9 6 6 6-6" /></svg>;
  if (name === "external") return <svg {...common}><path d="M14 5h5v5M19 5l-8 8" /><path d="M18 13v5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></svg>;
  if (name === "lock") return <svg {...common}><rect x="5" y="10" width="14" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>;
  if (name === "shield") return <svg {...common}><path d="M12 3 19 6v5c0 4.4-2.8 8-7 10-4.2-2-7-5.6-7-10V6l7-3Z" /><path d="m9 12 2 2 4-4" /></svg>;
  if (name === "upload") return <svg {...common}><path d="M12 16V4m-5 5 5-5 5 5" /><path d="M5 14v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4" /></svg>;
  return <svg {...common}><path d="M12 3.5 14.2 9l5.8.4-4.5 3.7 1.4 5.7-4.9-3.1-4.9 3.1 1.4-5.7L4 9.4 9.8 9 12 3.5Z" /></svg>;
}

export function RagStudio() {
  const [workspace, setWorkspace] = useState<WorkspaceSummary | null>(null);
  const [serverProviderConfigured, setServerProviderConfigured] = useState(false);
  const [accessRequired, setAccessRequired] = useState(false);
  const [authorized, setAuthorized] = useState(true);
  const [accessToken, setAccessToken] = useState("");
  const [accessTokenInput, setAccessTokenInput] = useState("");
  const [settings, setSettings] = useState<WorkspaceSettings>(defaultSettings);
  const [questions, setQuestions] = useState<RagQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [stage, setStage] = useState<WorkspaceStage>("setup");
  const [setupPage, setSetupPage] = useState<"profile" | "questions">("profile");
  const [apiKey, setApiKey] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [notice, setNotice] = useState<{ tone: "success" | "error" | "info"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadingWorkspace, setLoadingWorkspace] = useState(true);
  const [dragging, setDragging] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const [chat, setChat] = useState<ChatItem[]>([initialChat]);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void fetch("/api/health")
      .then((response) => response.json() as Promise<{ accessRequired?: boolean }>)
      .then(async (health) => {
        setAccessRequired(Boolean(health.accessRequired));
        if (health.accessRequired) {
          setAuthorized(false);
          setLoadingWorkspace(false);
          return;
        }
        const { response, data } = await readWorkspace("");
        if (!response.ok || !data.workspace) throw new Error(data.error || "The local workspace could not be loaded.");
        const loaded = data.workspace;
        setWorkspace(loaded);
        setServerProviderConfigured(loaded.providerConfigured);
        setSettings(loaded.settings);
        setQuestions(loaded.questions);
        setAnswers(loaded.answers);
        if (loaded.indexedAt && loaded.chunkCount) setStage("chat");
        else if (loaded.documents.length) setStage("knowledge");
        else if (loaded.settings.companyName) setStage("knowledge");
        setLoadingWorkspace(false);
      })
      .catch(() => {
        setLoadingWorkspace(false);
        setNotice({ tone: "error", text: "The local workspace could not be loaded." });
      });
  }, []);

  async function connectDeployment() {
    if (!accessTokenInput.trim()) return;
    const { response, data } = await readWorkspace(accessTokenInput.trim());
    if (!response.ok || !data.workspace) {
      setNotice({ tone: "error", text: data.error || "That access token was rejected." });
      setAuthorized(false);
      return;
    }
    const loaded = data.workspace;
    setAccessToken(accessTokenInput.trim());
    setAuthorized(true);
    setWorkspace(loaded);
    setServerProviderConfigured(loaded.providerConfigured);
    setSettings(loaded.settings);
    setQuestions(loaded.questions);
    setAnswers(loaded.answers);
    if (loaded.indexedAt && loaded.chunkCount) setStage("chat");
    else if (loaded.documents.length) setStage("knowledge");
    else if (loaded.settings.companyName) setStage("knowledge");
    setNotice(null);
  }

  const hasProfile = Boolean(settings.companyName && settings.industry && settings.useCase && settings.audience);
  const profileProgress = [settings.companyName, settings.industry, settings.useCase, settings.audience].filter(Boolean).length;
  const questionProgress = questions.filter((question) => answers[question.id]?.trim()).length;
  const suggestions = useMemo(() => {
    if (settings.useCase.toLowerCase().includes("support")) return ["What is our refund policy?", "How do I contact a human?", "What is the usual response time?"];
    if (settings.useCase.toLowerCase().includes("employee")) return ["What is our onboarding process?", "Who owns this process?", "What should I do next?"];
    return ["What are the most important things I should know?", "Summarize the key policies.", "Where can I find more detail?"];
  }, [settings.useCase]);

  function updateSetting<K extends keyof WorkspaceSettings>(key: K, value: WorkspaceSettings[K]) {
    setSettings((current) => ({ ...current, [key]: value }));
    setNotice(null);
  }

  function continueFromProfile() {
    if (!hasProfile) {
      setNotice({ tone: "error", text: "Complete the four profile fields first." });
      return;
    }
    const generated = buildQuestions(settings);
    setQuestions(generated);
    setAnswers((current) => ({ ...current }));
    setSetupPage("questions");
    setNotice(null);
  }

  async function saveWorkspace() {
    const missing = questions.find((question) => question.required && !answers[question.id]?.trim());
    if (missing) {
      setNotice({ tone: "error", text: `Answer “${missing.label}” before continuing.` });
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      const response = await fetch("/api/rag/workspace", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders(accessToken) },
        body: JSON.stringify({ settings, questions, answers }),
      });
      const data = (await response.json()) as { workspace?: WorkspaceSummary; error?: string };
      if (!response.ok || !data.workspace) throw new Error(errorMessage(data, "Could not save your workspace."));
      setWorkspace(data.workspace);
      setSettings(data.workspace.settings);
      setStage("knowledge");
      setNotice({ tone: "success", text: "Your assistant blueprint is saved. Add the source documents it should trust." });
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "Could not save your workspace." });
    } finally {
      setBusy(false);
    }
  }

  function rememberApiKey(value: string) {
    setApiKey(value);
  }

  async function upload(files: FileList | File[]) {
    if (!files.length) return;
    setBusy(true);
    setNotice(null);
    const formData = new FormData();
    Array.from(files).forEach((file) => formData.append("files", file));
    try {
      const response = await fetch("/api/rag/documents", { method: "POST", headers: authHeaders(accessToken), body: formData });
      const data = (await response.json()) as { workspace?: WorkspaceSummary; errors?: string[]; error?: string };
      if (!response.ok || !data.workspace) throw new Error(errorMessage(data, "The documents could not be uploaded."));
      setWorkspace(data.workspace);
      setStage("knowledge");
      setNotice({ tone: data.errors?.length ? "info" : "success", text: data.errors?.length ? `Uploaded with notes: ${data.errors.join(" ")}` : "Documents uploaded and split into searchable passages." });
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "The documents could not be uploaded." });
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function removeDocument(id: string) {
    setBusy(true);
    try {
      const response = await fetch(`/api/rag/documents?id=${encodeURIComponent(id)}`, { method: "DELETE", headers: authHeaders(accessToken) });
      const data = (await response.json()) as { workspace?: WorkspaceSummary; error?: string };
      if (!response.ok || !data.workspace) throw new Error(errorMessage(data, "Could not remove that document."));
      setWorkspace(data.workspace);
      setNotice({ tone: "info", text: "Document removed. Build the index again when your sources are final." });
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "Could not remove that document." });
    } finally {
      setBusy(false);
    }
  }

  async function buildIndex() {
    if (!workspace?.documents.length) {
      setNotice({ tone: "error", text: "Upload at least one document first." });
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      const response = await fetch("/api/rag/build", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders(accessToken) },
        body: JSON.stringify({ apiKey, apiBaseUrl: settings.apiBaseUrl, providerId: settings.embeddingProvider, embeddingModel: settings.embeddingModel }),
      });
      const data = (await response.json()) as { workspace?: WorkspaceSummary; message?: string; embeddingError?: string; error?: string };
      if (!response.ok || !data.workspace) throw new Error(errorMessage(data, "Could not build the index."));
      setWorkspace(data.workspace);
      setStage("chat");
      setNotice({ tone: data.embeddingError ? "info" : "success", text: data.embeddingError ? `Keyword index ready. Embeddings were skipped: ${data.embeddingError}` : `${data.message || "Index ready."} Your assistant is ready to test.` });
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "Could not build the index." });
    } finally {
      setBusy(false);
    }
  }

  async function publishAssistant() {
    if (!workspace?.indexedAt) {
      setNotice({ tone: "error", text: "Build a completed index before publishing the assistant." });
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      const response = await fetch("/api/rag/publish", { method: "POST", headers: { "Content-Type": "application/json", ...authHeaders(accessToken) }, body: JSON.stringify({}) });
      const data = (await response.json()) as { workspace?: WorkspaceSummary; error?: string };
      if (!response.ok || !data.workspace) throw new Error(errorMessage(data, "Could not publish the assistant."));
      setWorkspace(data.workspace);
      setNotice({ tone: "success", text: `Published. Your public assistant is available at /chat/${data.workspace.published?.slug}.` });
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "Could not publish the assistant." });
    } finally {
      setBusy(false);
    }
  }

  async function sendMessage(text = chatInput) {
    const message = text.trim();
    if (!message || chatBusy) return;
    setChatInput("");
    setChat((current) => [...current, { role: "user", content: message }]);
    setChatBusy(true);
    try {
      const response = await fetch("/api/rag/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders(accessToken) },
        body: JSON.stringify({ message, apiKey, apiBaseUrl: settings.apiBaseUrl, providerId: settings.chatProvider, model: settings.model, embeddingModel: settings.embeddingModel, history: chat.filter((item) => item.role === "user" || item.role === "assistant").slice(-6).map(({ role, content }) => ({ role, content })) }),
      });
      const data = (await response.json()) as { answer?: string; sources?: ChatSource[]; error?: string };
      if (!response.ok || !data.answer) throw new Error(errorMessage(data, "The assistant could not answer that."));
      setChat((current) => [...current, { role: "assistant", content: data.answer || "", sources: data.sources }]);
    } catch (error) {
      setChat((current) => [...current, { role: "assistant", content: error instanceof Error ? error.message : "The assistant could not answer that." }]);
    } finally {
      setChatBusy(false);
    }
  }

  function goTo(next: WorkspaceStage) {
    if (next === "knowledge" && !hasProfile) {
      setSetupPage("profile");
      setStage("setup");
      return;
    }
    if (next === "chat" && !workspace?.indexedAt) {
      setStage("knowledge");
      return;
    }
    setStage(next);
  }

  return (
    <main className="rag-app-shell">
      <aside className="rag-sidebar">
        <div className="rag-brand">
          <div className="rag-brand-mark"><span /><span /><span /></div>
          <div><strong>Contexture</strong><small>open RAG studio</small></div>
        </div>

        <div className="rag-workspace-card">
          <span className="eyebrow">WORKSPACE</span>
          <strong>{settings.companyName || "Your company"}</strong>
          <span className="rag-sidebar-muted">Local and private</span>
        </div>

        <nav className="rag-nav" aria-label="Workspace navigation">
          <button className={stage === "setup" ? "active" : ""} onClick={() => goTo("setup")}><span className="nav-number">01</span><span><b>Shape</b><small>Define the assistant</small></span>{hasProfile && <i><Icon name="check" size={12} /></i>}</button>
          <button className={stage === "knowledge" ? "active" : ""} onClick={() => goTo("knowledge")}><span className="nav-number">02</span><span><b>Knowledge</b><small>Connect your sources</small></span>{workspace?.documents.length ? <i>{workspace.documents.length}</i> : null}</button>
          <button className={stage === "chat" ? "active" : ""} onClick={() => goTo("chat")}><span className="nav-number">03</span><span><b>Test assistant</b><small>Ask with citations</small></span>{workspace?.indexedAt && <i><Icon name="check" size={12} /></i>}</button>
        </nav>

        <div className="rag-sidebar-bottom">
          <div className="privacy-note"><span className="status-dot" /> <span><b>Private by default</b><small>Keys stay in memory or server environment.</small></span></div>
          <a href="https://github.com/" target="_blank" rel="noreferrer" className="github-link">View on GitHub <Icon name="external" size={14} /></a>
        </div>
      </aside>

      <section className="rag-main">
        <header className="rag-header">
          <div><span className="eyebrow">COMPANY KNOWLEDGE / {stage === "setup" ? "SETUP" : stage === "knowledge" ? "INDEX" : "PLAYGROUND"}</span><h1>{stage === "setup" ? "Build an assistant that knows your business." : stage === "knowledge" ? "Give it the right context." : "Put your assistant through its paces."}</h1></div>
          <div className="rag-header-actions"><span className="connection-chip"><span className="status-dot" /> {apiKey || serverProviderConfigured ? "Model connected" : "Add your model key"}</span><a href="https://github.com/" target="_blank" rel="noreferrer" className="header-link">Docs <Icon name="external" size={14} /></a></div>
        </header>

        {loadingWorkspace ? <WorkspaceLoading /> : accessRequired && !authorized ? <AccessGate value={accessTokenInput} onChange={setAccessTokenInput} onConnect={() => void connectDeployment()} /> : <>
          {notice && <div className={`rag-notice ${notice.tone}`} role="status"><span className="notice-icon"><Icon name={notice.tone === "success" ? "check" : "spark"} size={14} /></span>{notice.text}<button onClick={() => setNotice(null)} aria-label="Dismiss"><Icon name="close" size={16} /></button></div>}
          {stage === "setup" && <SetupStage settings={settings} updateSetting={updateSetting} setupPage={setupPage} setSetupPage={setSetupPage} questions={questions} answers={answers} setAnswers={setAnswers} profileProgress={profileProgress} questionProgress={questionProgress} onContinue={continueFromProfile} onSave={saveWorkspace} busy={busy} />}
          {stage === "knowledge" && <KnowledgeStage workspace={workspace} settings={settings} updateSetting={updateSetting} apiKey={apiKey} rememberApiKey={rememberApiKey} showApiKey={showApiKey} setShowApiKey={setShowApiKey} dragging={dragging} setDragging={setDragging} fileInput={fileInput} upload={upload} removeDocument={removeDocument} buildIndex={buildIndex} busy={busy} />}
          {stage === "chat" && <ChatStage workspace={workspace} settings={settings} updateSetting={updateSetting} apiKey={apiKey} rememberApiKey={rememberApiKey} showApiKey={showApiKey} setShowApiKey={setShowApiKey} chat={chat} chatInput={chatInput} setChatInput={setChatInput} chatBusy={chatBusy} sendMessage={sendMessage} suggestions={suggestions} onReindex={() => setStage("knowledge")} onPublish={publishAssistant} busy={busy} />}
        </>}
      </section>
    </main>
  );
}

function AccessGate({ value, onChange, onConnect }: { value: string; onChange: (value: string) => void; onConnect: () => void }) {
  return <div className="access-gate card-surface"><div className="access-gate-icon"><Icon name="lock" size={20} /></div><span className="eyebrow">PRIVATE DEPLOYMENT</span><h2>Enter the workspace access token.</h2><p>This deployment is protected by <code>RAG_ACCESS_TOKEN</code>. The token is held in this browser session and sent only as a bearer header to this app.</p><form onSubmit={(event) => { event.preventDefault(); onConnect(); }}><input type="password" value={value} onChange={(event) => onChange(event.target.value)} placeholder="Paste access token" autoComplete="off" /><button className="primary-button" type="submit">Unlock workspace <Icon name="arrow-right" size={15} /></button></form></div>;
}

function WorkspaceLoading() {
  return <div className="workspace-loading" role="status" aria-live="polite">
    <div className="loading-heading"><div className="loading-icon"><Icon name="spark" size={15} /></div><span /><span /></div>
    <div className="loading-layout"><div className="loading-card"><span /><span /><span /><span /></div><div className="loading-side"><span /><span /><span /></div></div>
    <p>Loading your private workspace…</p>
  </div>;
}

function SetupStage({ settings, updateSetting, setupPage, setSetupPage, questions, answers, setAnswers, profileProgress, questionProgress, onContinue, onSave, busy }: {
  settings: WorkspaceSettings;
  updateSetting: <K extends keyof WorkspaceSettings>(key: K, value: WorkspaceSettings[K]) => void;
  setupPage: "profile" | "questions";
  setSetupPage: (value: "profile" | "questions") => void;
  questions: RagQuestion[];
  answers: Record<string, string>;
  setAnswers: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  profileProgress: number;
  questionProgress: number;
  onContinue: () => void;
  onSave: () => void;
  busy: boolean;
}) {
  return <div className="rag-stage-wrap">
    <div className="stage-intro"><span className="step-kicker">01 / 02</span><p>{setupPage === "profile" ? "Every useful assistant starts with a point of view. Tell us what it is here to do." : "A few sharper questions make the assistant sound like your team, not a generic chatbot."}</p></div>
    <div className="setup-layout">
      <div className="setup-form card-surface">
        <div className="form-topline"><div><span className="eyebrow">{setupPage === "profile" ? "THE BASICS" : "THE DETAILS"}</span><h2>{setupPage === "profile" ? "What are we building?" : "Make the rules explicit."}</h2></div><span className="completion-count">{setupPage === "profile" ? `${profileProgress}/4 complete` : `${questionProgress}/${questions.length} answered`}</span></div>
        {setupPage === "profile" ? <>
          <label className="field-label">Company or team name<input value={settings.companyName} onChange={(event) => updateSetting("companyName", event.target.value)} placeholder="Acme, Inc." /></label>
          <div className="field-grid"><label className="field-label">Industry<select value={settings.industry} onChange={(event) => updateSetting("industry", event.target.value)}><option value="">Choose one</option>{industryOptions.map((option) => <option key={option}>{option}</option>)}</select></label><label className="field-label">Primary audience<select value={settings.audience} onChange={(event) => updateSetting("audience", event.target.value)}><option value="">Choose one</option>{audienceOptions.map((option) => <option key={option}>{option}</option>)}</select></label></div>
          <label className="field-label">What should it help with?<select value={settings.useCase} onChange={(event) => updateSetting("useCase", event.target.value)}><option value="">Choose a job to be done</option>{useCaseOptions.map((option) => <option key={option}>{option}</option>)}</select></label>
          <label className="field-label">Voice and tone<textarea value={settings.tone} onChange={(event) => updateSetting("tone", event.target.value)} rows={2} placeholder="Clear, calm, and practical" /></label>
          <div className="form-actions"><span className="form-hint">You can tune every answer before publishing.</span><button className="primary-button" onClick={onContinue}>Continue <Icon name="arrow-right" size={15} /></button></div>
        </> : <>
          <div className="question-list">{questions.map((question, index) => <label className="question-row" key={question.id}><span className="question-index">{String(index + 1).padStart(2, "0")}</span><span className="question-body"><b>{question.prompt}{question.required && <em>*</em>}</b>{question.kind === "select" ? <select value={answers[question.id] || ""} onChange={(event) => setAnswers((current) => ({ ...current, [question.id]: event.target.value }))}><option value="">Choose one</option>{question.options?.map((option) => <option key={option}>{option}</option>)}</select> : question.kind === "textarea" ? <textarea value={answers[question.id] || ""} onChange={(event) => setAnswers((current) => ({ ...current, [question.id]: event.target.value }))} rows={2} placeholder={question.placeholder} /> : <input value={answers[question.id] || ""} onChange={(event) => setAnswers((current) => ({ ...current, [question.id]: event.target.value }))} placeholder={question.placeholder} />}</span></label>)}</div>
          <div className="form-actions"><button className="text-button" onClick={() => setSetupPage("profile")}><Icon name="arrow-left" size={15} /> Back</button><button className="primary-button" onClick={onSave} disabled={busy}>{busy ? "Saving…" : "Save blueprint"} {!busy && <Icon name="arrow-right" size={15} />}</button></div>
        </>}
      </div>
      <aside className="side-note"><div className="note-symbol"><Icon name="spark" size={17} /></div><h3>A little context goes a long way.</h3><p>These answers become the assistant’s operating brief. They keep it grounded when a document is ambiguous or incomplete.</p><div className="note-rule" /><span>Nothing is sent to a model yet.</span></aside>
    </div>
  </div>;
}

function ApiKeyField({ settings, updateSetting, apiKey, rememberApiKey, showApiKey, setShowApiKey }: { settings: WorkspaceSettings; updateSetting: <K extends keyof WorkspaceSettings>(key: K, value: WorkspaceSettings[K]) => void; apiKey: string; rememberApiKey: (value: string) => void; showApiKey: boolean; setShowApiKey: (value: boolean) => void }) {
  function chooseProvider(value: WorkspaceSettings["chatProvider"]) {
    updateSetting("chatProvider", value);
    updateSetting("embeddingProvider", value);
    if (providerProfiles[value].baseUrl) updateSetting("apiBaseUrl", providerProfiles[value].baseUrl);
  }
  return <div className="api-settings"><div className="api-settings-heading"><div><span className="eyebrow">YOUR MODEL</span><b>Connect a supported provider</b></div><span className="mini-lock"><Icon name="lock" size={12} /> local only</span></div><div className="api-fields"><label className="field-label">Chat and embedding provider<select value={settings.chatProvider} onChange={(event) => chooseProvider(event.target.value as WorkspaceSettings["chatProvider"])}>{Object.values(providerProfiles).map((provider) => <option key={provider.id} value={provider.id}>{provider.label}</option>)}</select></label><label className="field-label">API key<div className="password-wrap"><input type={showApiKey ? "text" : "password"} value={apiKey} onChange={(event) => rememberApiKey(event.target.value)} placeholder={settings.chatProvider === "ollama" ? "Not required for local Ollama" : "sk-…"} autoComplete="off" /><button type="button" onClick={() => setShowApiKey(!showApiKey)}>{showApiKey ? "Hide" : "Show"}</button></div></label><label className="field-label">Base URL<input value={settings.apiBaseUrl} onChange={(event) => updateSetting("apiBaseUrl", event.target.value)} placeholder="https://api.openai.com/v1" /></label><label className="field-label">Chat model<input value={settings.model} onChange={(event) => updateSetting("model", event.target.value)} placeholder="gpt-4o-mini" /></label><label className="field-label">Embedding model<input value={settings.embeddingModel} onChange={(event) => updateSetting("embeddingModel", event.target.value)} placeholder="text-embedding-3-small" /></label></div><p className="api-help">OpenAI, Claude, Groq, OpenRouter, Ollama, Mistral, Together, Gemini, DeepSeek, and custom OpenAI-compatible servers are supported. Claude uses keyword retrieval unless you configure a separate embedding provider on the server.</p></div>;
}

function KnowledgeStage({ workspace, settings, updateSetting, apiKey, rememberApiKey, showApiKey, setShowApiKey, dragging, setDragging, fileInput, upload, removeDocument, buildIndex, busy }: { workspace: WorkspaceSummary | null; settings: WorkspaceSettings; updateSetting: <K extends keyof WorkspaceSettings>(key: K, value: WorkspaceSettings[K]) => void; apiKey: string; rememberApiKey: (value: string) => void; showApiKey: boolean; setShowApiKey: (value: boolean) => void; dragging: boolean; setDragging: (value: boolean) => void; fileInput: React.RefObject<HTMLInputElement | null>; upload: (files: FileList | File[]) => Promise<void>; removeDocument: (id: string) => Promise<void>; buildIndex: () => Promise<void>; busy: boolean }) {
  return <div className="rag-stage-wrap"><div className="stage-intro"><span className="step-kicker">02 / KNOWLEDGE</span><p>Upload the documents your assistant should trust. We extract and chunk them locally. If you build semantic embeddings, those chunks are sent to your selected embedding provider.</p></div><div className="knowledge-layout"><div className="knowledge-main"><div className={`dropzone card-surface ${dragging ? "dragging" : ""}`} onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); void upload(event.dataTransfer.files); }} onClick={() => fileInput.current?.click()}><input ref={fileInput} type="file" multiple accept=".pdf,.docx,.txt,.md,.markdown,.csv,.html,.htm,.json" onChange={(event) => void upload(event.target.files || [])} /><div className="upload-icon"><Icon name="upload" size={22} /></div><h2>{busy ? "Processing your documents…" : "Drop your knowledge here"}</h2><p>PDF, DOCX, Markdown, TXT, CSV, HTML, or JSON<br /><span>Up to 15 MB per file</span></p><button type="button" className="secondary-button" onClick={(event) => { event.stopPropagation(); fileInput.current?.click(); }}>Browse files</button></div><div className="documents-head"><div><span className="eyebrow">SOURCES {workspace?.documents.length ? `· ${workspace.documents.length}` : ""}</span><h2>Your knowledge base</h2></div>{workspace?.indexedAt && <span className="indexed-pill"><span className="status-dot" />{dateLabel(workspace.indexedAt)}</span>}</div><div className="document-list">{workspace?.documents.length ? workspace.documents.map((document) => <div className="document-row" key={document.id}><div className="file-type">{document.name.toLowerCase().endsWith(".pdf") ? "PDF" : document.name.toLowerCase().endsWith(".docx") ? "DOC" : "TXT"}</div><div className="document-meta"><b>{document.name}</b><span>{formatBytes(document.size)} · {document.chunkCount} passages · added {new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(new Date(document.uploadedAt))}</span></div><button className="remove-button" onClick={() => void removeDocument(document.id)} disabled={busy} aria-label={`Remove ${document.name}`}>×</button></div>) : <div className="empty-documents"><span>◌</span><p>Your source library is empty.<br />Upload a handbook, help center, or internal docs to begin.</p></div>}</div></div><aside className="knowledge-side"><ApiKeyField settings={settings} updateSetting={updateSetting} apiKey={apiKey} rememberApiKey={rememberApiKey} showApiKey={showApiKey} setShowApiKey={setShowApiKey} /><div className="build-card"><div className="build-card-top"><span className="eyebrow">READY WHEN YOU ARE</span><span className="build-count">{workspace?.documents.length || 0} docs · {workspace?.chunkCount || 0} passages</span></div><h3>Build your private index.</h3><p>{apiKey ? "Your embedding model will make this search semantic and precise." : "You can build a keyword index now, or add a key for semantic retrieval."}</p><button className="primary-button wide" onClick={() => void buildIndex()} disabled={busy || !workspace?.documents.length}>{busy ? "Building…" : workspace?.indexedAt ? "Rebuild index" : "Build index"}<Icon name="arrow-right" size={15} /></button></div><div className="security-callout"><span>⌁</span><p><b>Local workspace, explicit provider calls.</b><br />Chat sends retrieved passages; semantic indexing sends chunks to your embedding provider.</p></div></aside></div></div>;
}

function ChatStage({ workspace, settings, updateSetting, apiKey, rememberApiKey, showApiKey, setShowApiKey, chat, chatInput, setChatInput, chatBusy, sendMessage, suggestions, onReindex, onPublish, busy }: { workspace: WorkspaceSummary | null; settings: WorkspaceSettings; updateSetting: <K extends keyof WorkspaceSettings>(key: K, value: WorkspaceSettings[K]) => void; apiKey: string; rememberApiKey: (value: string) => void; showApiKey: boolean; setShowApiKey: (value: boolean) => void; chat: ChatItem[]; chatInput: string; setChatInput: (value: string) => void; chatBusy: boolean; sendMessage: (text?: string) => Promise<void>; suggestions: string[]; onReindex: () => void; onPublish: () => Promise<void>; busy: boolean }) {
  return <div className="rag-stage-wrap chat-stage-wrap"><div className="stage-intro"><span className="step-kicker">03 / PLAYGROUND</span><p>Ask the questions your customers or team will ask. Every answer should be useful, grounded, and easy to verify.</p></div><div className="playground-layout"><div className="chat-panel card-surface"><div className="chat-panel-head"><div className="assistant-avatar"><Icon name="spark" size={16} /></div><div><b>{settings.companyName || "Company"} assistant</b><span>{workspace?.chunkCount || 0} passages · {workspace?.searchMode === "hybrid" ? "hybrid retrieval" : "keyword retrieval"}</span></div><span className="online-chip"><span className="status-dot" />Ready</span></div><div className="messages">{chat.map((item, index) => <div className={`message ${item.role}`} key={`${item.role}-${index}`}><div className="message-bubble">{item.content}{item.sources?.length ? <div className="sources"><span className="sources-title">SOURCES USED</span>{item.sources.map((source) => <details key={source.id}><summary><span className="source-number">{source.documentName.slice(0, 3).toUpperCase()}</span>{source.documentName}<span className="chevron"><Icon name="chevron" size={14} /></span></summary><p>{source.snippet}</p></details>)}</div> : null}</div></div>)}{chatBusy && <div className="message assistant"><div className="message-bubble thinking"><span /><span /><span /></div></div>}</div><div className="suggestion-row">{suggestions.map((suggestion) => <button key={suggestion} onClick={() => void sendMessage(suggestion)} disabled={chatBusy}>{suggestion}</button>)}</div><form className="chat-composer" onSubmit={(event) => { event.preventDefault(); void sendMessage(); }}><input value={chatInput} onChange={(event) => setChatInput(event.target.value)} placeholder="Ask your knowledge base anything…" disabled={chatBusy} /><button type="submit" disabled={chatBusy || !chatInput.trim()} aria-label="Send message"><Icon name="arrow-up" size={18} /></button></form></div><aside className="playground-side"><div className="side-status"><span className="eyebrow">INDEX STATUS</span><div className="status-line"><span className="big-status-dot" /><div><b>All systems ready</b><small>{dateLabel(workspace?.indexedAt || null)}</small></div></div><div className="status-stats"><span><b>{workspace?.documents.length || 0}</b> documents</span><span><b>{workspace?.chunkCount || 0}</b> passages</span></div><button className="text-button" onClick={onReindex}><Icon name="arrow-right" size={15} /> Manage knowledge</button></div><div className="playground-key"><ApiKeyField settings={settings} updateSetting={updateSetting} apiKey={apiKey} rememberApiKey={rememberApiKey} showApiKey={showApiKey} setShowApiKey={setShowApiKey} /><p>Changes apply to the next question. Rebuild the index after changing the embedding model.</p>{workspace?.published ? <a className="live-assistant-link" href={`/chat/${workspace.published.slug}`} target="_blank" rel="noreferrer">Open live assistant ?</a> : <button className="primary-button wide publish-button" onClick={() => void onPublish()} disabled={busy || !workspace?.indexedAt}>{busy ? "Publishing�" : "Publish live assistant"}<Icon name="arrow-right" size={15} /></button>}</div></aside></div></div>;
}

