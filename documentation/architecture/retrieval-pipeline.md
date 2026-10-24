# Retrieval pipeline

**Status: not implemented yet.** Nothing in this document exists in the
repository as of 2026-09-01 — it records the planned design so it isn't
lost, per [ADR-003](../adr/003-documentation-as-engineering.md). Do not
treat any of this as current behavior.

## Blocking dependency

Retrieval cannot be built or tested meaningfully until embedding
persistence is fixed — see the ingestion gap in
[ingestion-pipeline.md](ingestion-pipeline.md) and the concrete next step
in [status.md](../status.md). Building a similarity index or search
endpoint against all-`NULL` embedding columns would not be verifiable.

## Planned `POST /api/search`

Input: a user question, plus an optional result count/filter.

Planned behavior:

1. Create an embedding for the question using the same model as ingestion
   (`text-embedding-3-small` — the query and the corpus must share an
   embedding space).
2. Query `DocumentChunk` ordered by `embedding <=> queryVector` (cosine
   distance).
3. Return the top-K chunks with useful metadata (document ID, chunk index,
   distance) for citation later.

Implementation should use parameterized raw SQL (Prisma doesn't model
`vector` operators natively) with top-K limits, per the guardrail against
string-concatenated SQL in [status.md](../status.md).

## Planned similarity index

Add an HNSW index only after real vectors are confirmed present (not
before — see [status.md](../status.md) guardrails). For cosine distance
(`<=>`), the matching operator class is generally `vector_cosine_ops`.

## Planned chat/answer endpoint (full RAG milestone)

1. Add a chat/answer endpoint.
2. Retrieve relevant chunks first (via `/api/search`).
3. Send only retrieved context and the user question to the generation model.
4. Return source citations tied to documents/chunks.
5. Add observability and retry/error handling; add a basic UI.

## Design direction not yet implemented: background embedding worker

The current `/api/extract` endpoint embeds synchronously during
extraction. A future production shape should split responsibilities:

```text
Upload → extract/chunk/persist → background embedding worker → persist vectors
```

For the MVP, synchronous vector persistence (once fixed) is acceptable.
Keep the code boundaries clean (per
[ADR-004](../adr/004-thin-routes-isolated-services.md)) so a queue/worker
can be introduced later without redesigning the data model.
