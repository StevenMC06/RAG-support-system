# ADR-019: Use pgvector, not a dedicated vector database

**Status:** Accepted

## Context

The project already uses PostgreSQL for `Document` and `DocumentChunk`
metadata. Storing and searching embeddings needs a vector-capable store,
and a dedicated vector database (Pinecone, Weaviate, Milvus) is one option.

## Decision

Use the `pgvector` PostgreSQL extension. The database image is
`pgvector/pgvector:pg17` (not plain `postgres:17`); `DocumentChunk.embedding`
is `vector(1536)`, matching OpenAI's `text-embedding-3-small` output
dimensionality (see [ADR-020](020-embedding-provider-and-model.md)).

## Rationale

- pgvector is a PostgreSQL extension, not a separate database or company —
  it adds the `vector(1536)` data type, distance operators such as `<=>`,
  and vector indexes.
- One durable data system for relational metadata and embeddings.
- SQL joins and transactional consistency between chunks and their vectors.
- Lower cost and operational burden than running a second database service.
- A strong fit for an MVP/small-to-medium corpus.

## Alternatives considered

- **A dedicated vector database** (Pinecone, Weaviate, Milvus). Can offer
  specialized features and better performance at extremely large scale, but
  adds another service, another bill, and a synchronization problem between
  two systems of record. Milvus-scale infrastructure would be overkill for
  this project's current corpus size.

## Consequences

- Prisma does not natively model `vector` as an ordinary scalar; the schema
  uses `embedding Unsupported("vector(1536)")?`, and vector reads/writes go
  through parameterized raw SQL as a deliberate, limited escape hatch (not a
  reason to abandon Prisma).
- Enabling the extension had to become part of migration history
  (`CREATE EXTENSION IF NOT EXISTS vector;` before the `ALTER TABLE`) so a
  fresh database/shadow database isn't dependent on tribal knowledge — see
  [operations/local-development.md](../operations/local-development.md)
  for the shadow-database issue this caused in practice.

## Revisit when

Actual dataset size or query latency requirements prove Postgres/pgvector
insufficient — not before that's demonstrated.
