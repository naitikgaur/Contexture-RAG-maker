# Security and deployment notes

Contexture is designed to be self-hosted. It is a single-workspace application by default: the local `.data/rag-workspace.json` file contains extracted document text and embeddings, so protect the host and its backups like the company data it contains. The builder is an admin surface; public users should use only the published `/chat/<slug>` surface.

## Before exposing it to a network

1. Set a long random `RAG_ACCESS_TOKEN`.
2. Set `RAG_CHAT_API_KEY` and, when using semantic retrieval, `RAG_EMBEDDING_API_KEY` on the server instead of asking users to paste keys.
3. Keep `.env` and `.data/` out of Git and out of public artifact storage.
4. Put the app behind HTTPS and a reverse proxy with request-size and rate limits.
5. Back up `.data/` only to an encrypted, access-controlled destination.
6. Restrict outbound network access to the provider base URL where your infrastructure allows it.
7. Review your model provider's retention, training, and regional-processing terms.
8. Publish only after testing the assistant with representative and adversarial questions.

## Data flow

- Uploaded files are parsed and chunked on the application server.
- Without embeddings, document text remains in the local workspace and retrieval is keyword-based.
- Building a semantic index sends chunks to the configured `/embeddings` endpoint.
- A chat request sends only the retrieved passages and the configured operating brief to `/chat/completions`.
- Browser-entered API keys remain in memory for that browser tab/session and are not persisted in `.data`.
- Server-side keys are read from environment variables and are never returned by the workspace API.
- Public chat reads an immutable published release; draft uploads and settings changes are not public until explicitly published.

## Model safety

The system prompt treats document text as untrusted reference material and instructs the model to ignore prompt-injection instructions inside documents. This reduces a common RAG failure mode, but it does not make a model infallible. For regulated or high-impact workflows, add human review, provider controls, access logging, and domain-specific evaluation before enabling automated actions.

## Multi-tenant SaaS

The local JSON store is not a multi-tenant database. A hosted SaaS implementation must replace `src/lib/rag/store.ts` with authenticated tenant-scoped persistence, encrypted blob storage, a tenant-scoped vector index, quotas, audit logs, deletion workflows, and background jobs. Do not put multiple companies in the same unpartitioned JSON file. The shared admin token is suitable for a trusted self-hosted workspace, not a multi-user identity system.
