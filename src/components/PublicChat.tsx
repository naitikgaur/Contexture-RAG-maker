"use client";

import { useEffect, useState } from "react";
import type { ChatSource } from "@/lib/rag/types";

type Message = { role: "user" | "assistant"; content: string; sources?: ChatSource[] };

export function PublicChat({ slug }: { slug: string }) {
  const [identity, setIdentity] = useState<{ companyName: string; companyDescription: string; audience: string } | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    void fetch(`/api/public/chat?slug=${encodeURIComponent(slug)}`)
      .then(async (response) => {
        const data = await response.json() as typeof identity & { error?: string };
        if (!response.ok) throw new Error(data.error || "Assistant not found.");
        setIdentity(data);
        setMessages([{ role: "assistant", content: `Hi — I’m the ${data.companyName || "company"} knowledge assistant. Ask me anything covered by the published documents.` }]);
      })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Assistant not found."));
  }, [slug]);

  async function send() {
    const message = input.trim();
    if (!message || busy) return;
    setInput("");
    setError("");
    const history = messages.slice(-6).map(({ role, content }) => ({ role, content }));
    setMessages((current) => [...current, { role: "user", content: message }]);
    setBusy(true);
    try {
      const response = await fetch("/api/public/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slug, message, history }) });
      const data = await response.json() as { answer?: string; sources?: ChatSource[]; error?: string };
      if (!response.ok || !data.answer) throw new Error(data.error || "The assistant could not answer.");
      setMessages((current) => [...current, { role: "assistant", content: data.answer || "", sources: data.sources }]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The assistant could not answer.");
    } finally {
      setBusy(false);
    }
  }

  return <main className="public-chat-shell"><section className="public-chat-card"><header className="public-chat-header"><div className="public-chat-mark">✦</div><div><span className="eyebrow">PUBLISHED KNOWLEDGE ASSISTANT</span><h1>{identity?.companyName || "Company assistant"}</h1><p>{identity?.companyDescription || "Answers grounded in the company’s published knowledge base."}</p></div><span className="public-live"><span />Live</span></header>{error && <div className="public-error" role="alert">{error}</div>}<div className="public-messages" role="log" aria-live="polite">{messages.map((message, index) => <article className={`public-message ${message.role}`} key={`${message.role}-${index}`}><div className="public-bubble">{message.content}{message.sources?.length ? <div className="public-sources"><b>Sources</b>{message.sources.map((source) => <details key={source.id}><summary>{source.documentName}</summary><p>{source.snippet}</p></details>)}</div> : null}</div></article>)}{busy && <article className="public-message assistant"><div className="public-bubble public-thinking">Assistant is searching the knowledge base…</div></article>}</div><form className="public-composer" onSubmit={(event) => { event.preventDefault(); void send(); }}><label htmlFor="public-question">Ask a question</label><textarea id="public-question" value={input} onChange={(event) => setInput(event.target.value)} placeholder="Ask about this company’s policies, products, or process…" rows={2} disabled={busy || Boolean(error && !identity)} /><button type="submit" disabled={busy || !input.trim()}>Send</button></form><footer className="public-chat-footer">Answers are generated from published company documents. Verify important decisions with the company.</footer></section></main>;
}
