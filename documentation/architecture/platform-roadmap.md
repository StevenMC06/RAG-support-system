# Platform direction and incremental roadmap

Recorded: 2026-11-22. This is planned architecture, not deployed behavior.

## Responsibility boundaries

- A separate data project collects, cleans, and prepares public data. Proposed
  handoff: versioned cleaned text, stable document IDs, source URLs, and
  license/provenance metadata. The concrete transfer interface remains undecided.
- This RAG project owns ingestion, retrieval chunks, embeddings, search, and
  cited context/answers. Its current ingestion accepts PDFs; a clean-data import
  interface is future work.
- A future orchestrator coordinates RAG, model selection, and additional tools.
  Most requests should use locally hosted open-source models, escalating complex
  requests to cloud and then frontier models. These are routing tiers; models,
  hosting, escalation criteria, and budgets have not been selected.

Current implementation still uses OpenAI embeddings and answer generation.
Local generation does not require an embedding migration. Changing the embedding
space requires compatible query embeddings and corpus reindexing.

## Feature sequence

1. Request/call IDs and stage timing: implemented; see
   [request timing](../operations/request-timing.md).
2. Streaming answers and first-text/token-usage timing: implemented; see
   [streaming chat](../operations/streaming-chat.md). This improves incremental
   delivery without claiming faster total generation.
3. Managed tracing: Langfuse Cloud is recommended, not provisioned or selected
   irrevocably. Measure baseline vector retrieval and response latency first.
4. PostgreSQL keyword retrieval, tested independently against prepared data.
5. Proposed hybrid retrieval: keyword + pgvector candidates fused by RRF.
   Compare quality and p50/p95 latency against vector-only before defaulting to it.
6. Optional reranking experiment after measurement. Adopt only if quality gains
   justify added model latency and cost. Routing/orchestration and more tools
   follow as separately scoped features.

Keep PostgreSQL/pgvector unless measured requirements justify a separate engine.
Fix duplicate embedding writes and nontransactional chunk replacement before
relying on ingestion consistency. Do not treat instrumentation as proof of
production readiness.

## Evaluation isolation

Development agents may inspect test questions and answers. The running RAG
application must not access hidden questions in advance or answer/relevance
labels. A separately permissioned evaluator submits one question at a time and
scores privately. Do not index evaluator assets or give the application tools,
credentials, or telemetry access that reveals the answer set. Hiding a folder
is insufficient. Keep dataset/model/retrieval versions with evaluation runs.
