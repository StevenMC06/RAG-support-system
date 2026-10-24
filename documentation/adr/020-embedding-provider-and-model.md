# ADR-020: Embedding provider, model, and batching strategy

**Status:** Accepted

## Context

Chunked document text needs to become vectors for similarity search. The
provider/model choice determines vector dimensionality (and therefore the
`pgvector` column type) and cost/latency per document.

## Decision

Use OpenAI's `text-embedding-3-small` (1,536 dimensions), called via
`lib/embeddings.ts`, with all chunk texts for a document embedded in a
single batched request rather than one request per chunk.

## Rationale

- `text-embedding-3-small` is inexpensive and sufficiently capable for this
  project's corpus size and learning goals.
- Batching all chunk texts in one OpenAI request reduces request overhead,
  is simpler, and retains input/output order for deterministic
  chunk-vector pairing (`chunks[i] <-> embeddings[i]`).
- Verified in practice: document ID `6` produced 19 chunks → 19 embeddings,
  each 1,536 dimensions.

## Alternatives considered

- **One embedding request per chunk.** Rejected — more requests, more
  overhead, no benefit over batching for this workload.
- **A larger/higher-dimensional embedding model.** Not evaluated yet; would
  require a new `pgvector` column type and re-embedding, so it's deferred
  rather than rejected outright.

## Consequences

- `app/api/extract/route.ts` guards `embeddings.length === chunks.length`
  before persistence and throws if they mismatch.
- Changing the embedding model later requires re-embedding all existing
  chunks and migrating the `vector(N)` column width — see
  [status.md](../status.md) for this as future work, not yet needed.

## Revisit when

Cost, quality, or dimensionality requirements change enough to justify a
different embedding model, or a non-OpenAI provider becomes preferable.
