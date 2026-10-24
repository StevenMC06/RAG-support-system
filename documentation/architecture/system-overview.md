# System overview

**Last verified against repository:** 2026-09-01 (routes, `prisma/schema.prisma`, `lib/`, `compose.yaml` read directly)

## Target pipeline

```text
Browser upload
  → validate
  → store PDF in S3
  → store metadata in PostgreSQL
  → extract text
  → chunk text
  → generate embeddings
  → store/search vectors with pgvector
  → retrieve context
  → generate an answer
```

## Implemented vs. planned

| Stage | Status | Where |
|---|---|---|
| Upload + validation | Implemented | `app/api/upload/route.ts` |
| S3 storage | Implemented | `lib/s3.ts` |
| Document metadata | Implemented | `prisma/schema.prisma` (`Document`), `app/api/upload/route.ts` |
| Text extraction | Implemented | `app/api/extract/route.ts` (via `pdf-parse`) |
| Chunking | Implemented | `lib/chunkTest.ts` |
| Embedding generation | Implemented | `lib/embeddings.ts` (OpenAI `text-embedding-3-small`) |
| Embedding **persistence** | **Not implemented** | see below |
| Vector similarity index | Not implemented | — |
| `/api/search` (retrieval) | Not implemented | — |
| Chat/answer generation with citations | Not implemented | — |

The single blocking gap right now: `app/api/extract/route.ts` computes
embeddings and checks `embeddings.length === chunks.length`, but
`prisma.documentChunk.createMany(...)` only writes `documentId`,
`chunkIndex`, `content`, and `tokenCount` — the embedding vectors are
computed and then discarded. Until chunk rows are written with their
vectors attached, this is a **document chunking pipeline, not a
retrievable RAG index**. Full detail and the concrete next step are in
[status.md](../status.md).

## Why this order

Ingestion is built and verified end-to-end before retrieval/chat, per
[ADR-002](../adr/002-ingestion-before-retrieval.md) — a chat feature can't
be trustworthy on top of an unverified ingestion path.

## Stack

- Next.js API routes, TypeScript
- Prisma (`@prisma/client` / `prisma` 7.x, using the `prisma-client`
  generator with a custom client output at `app/generated/prisma`)
- PostgreSQL 17 via the `pgvector/pgvector:pg17` Docker image (not plain
  `postgres:17` — see [ADR-019](../adr/019-pgvector-for-embeddings.md))
- pgvector extension for embedding storage and similarity search
- Amazon S3 (`@aws-sdk/client-s3`) for original PDF bytes
- OpenAI `text-embedding-3-small` embeddings (see
  [ADR-020](../adr/020-embedding-provider-and-model.md))
- `pdf-parse` (`PDFParse`) for text extraction
- `js-tiktoken` (`cl100k_base` encoding) for token-aware chunking

See [ingestion-pipeline.md](ingestion-pipeline.md) and
[retrieval-pipeline.md](retrieval-pipeline.md) for per-stage detail, and
the `adr/` folder for the reasoning behind each choice.
