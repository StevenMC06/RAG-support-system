# Current status

## Update: 2026-11-22

Source inspection confirms embedding persistence, vector retrieval, and cited
chat are implemented. Search/chat request and call timing is now implemented;
see [request timing](operations/request-timing.md) and the
[platform roadmap](architecture/platform-roadmap.md). These are code/test
observations, not live provider/database verification. The older milestone and
checklist below are historical and superseded where they conflict with this
update. Ingestion still has duplicate vector writes and nontransactional
replacement; hybrid search, managed tracing, reranking, and routing are planned.


**Last verified against repository:** 2026-09-01 (this file replaces the
living-status role of the archived `RAG_BACKEND_HANDOFF.md` — see
[archive/](archive/) for its full original text and narrative detail this
file summarizes).

This file changes often. Decisions belong in `adr/`; this file is "where
are we right now."

## Milestone

Upload, extraction, chunking, batch embedding generation, PostgreSQL, and
the pgvector schema are complete. **Embeddings are computed but not
persisted.** Until that's fixed, this is a document chunking pipeline, not
a retrievable RAG index. See
[architecture/ingestion-pipeline.md](architecture/ingestion-pipeline.md).

## The one required next step

In `app/api/extract/route.ts`, `prisma.documentChunk.createMany(...)`
writes `documentId`, `chunkIndex`, `content`, `tokenCount` — never
`embedding`. Prisma models the column as
`Unsupported("vector(1536)")`, so it can't go through `createMany`.

Plan:

1. Insert chunk rows with Prisma as today.
2. Persist each vector with parameterized Prisma raw SQL, identifying the
   row by `documentId` + `chunkIndex`, using a vector literal
   (`[0.12,-0.03,...]`) cast with `::vector`. Never string-interpolate the
   embedding values or identifiers unsafely — use Prisma's parameterized
   raw-SQL mechanism.
3. Keep `chunks[i] <-> embeddings[i]` pairing exact.
4. Make the delete/create/vector-write sequence safe for reprocessing —
   prefer a transaction where practical so a failed reprocess doesn't
   leave a document with stale chunks partially overwritten.
5. Verify with a real document:
   ```sql
   SELECT id, "documentId", "chunkIndex", embedding IS NOT NULL AS has_embedding
   FROM "DocumentChunk"
   WHERE "documentId" = 6
   LIMIT 1;
   ```
6. Only after that verification, add an HNSW similarity index
   (`vector_cosine_ops` for `<=>` cosine distance) and implement
   `/api/search`. Do not build the chat/answer endpoint before retrieval is
   independently verified. See
   [architecture/retrieval-pipeline.md](architecture/retrieval-pipeline.md).

## Open discrepancies between docs and repository

Found while restructuring documentation on 2026-09-01 — resolve by fixing
the code, or by correcting the record if the description was simply wrong:

- **Filename sanitization.** The archived handoff describes filename
  sanitization as an implemented Phase 1 safeguard. The current
  `app/api/upload/route.ts` stores `uploadedFile.name` directly with no
  sanitization. Needs a decision either way.
- **S3 key prefix.** ADR-009 (and the archived log) describe a
  `documents/<uuid>.pdf`-style prefixed key. The current `lib/s3.ts`
  produces `<uuid>.<ext>` with no prefix. Functionally fine (still unique),
  but worth deciding deliberately if a prefix is wanted.
- **`container_name` in `compose.yaml`.** ADR-013 prefers letting Compose
  manage container names; `compose.yaml` sets `container_name:
  rag-postgres` explicitly. Not necessarily wrong, but an undecided
  deviation — see [ADR-013](adr/013-compose-managed-names-and-volumes.md).

## Known technical debt (tracked, not urgent)

- **Orphaned S3 objects.** If S3 upload succeeds but the Prisma insert
  fails, the S3 object is never cleaned up. No compensation/reconciliation
  step exists yet. See
  [ADR-008](adr/008-s3-upload-before-db-row.md).
- **Overly broad IAM policy.** The backend's IAM identity still uses
  `AmazonS3FullAccess` instead of a bucket-scoped custom policy. See
  [ADR-016](adr/016-iam-least-privilege-private-s3.md) and
  [operations/aws-and-s3.md](operations/aws-and-s3.md).

## Guardrails

- Do not switch away from PostgreSQL + pgvector unless there is a
  demonstrated scale requirement.
- Do not use a plain `postgres:17` Docker image; the active database image
  must include pgvector.
- Do not bypass or discard Prisma migration history.
- Do not use string-concatenated SQL for user-controlled values;
  parameterize raw SQL.
- Do not add a similarity index before confirming embeddings are actually
  stored.
- Do not treat "HTTP 200" as proof of success — verify persisted vectors
  and retrieval relevance in the database.
- Do not delete/recreate Docker volumes while debugging local
  infrastructure.

## Verification checklist

- [x] PDF upload to S3 works.
- [x] Document metadata persists in PostgreSQL.
- [x] PDF text downloads and extracts.
- [x] Semantic/token-aware chunking works.
- [x] Chunks persist and can be reprocessed idempotently.
- [x] Batch embedding generation works (19 chunks / 19 vectors / 1,536
      dimensions verified against document ID 6).
- [x] pgvector extension is installed and enabled.
- [x] `DocumentChunk.embedding vector(1536)` is migrated.
- [ ] Generated embedding arrays persist to `DocumentChunk.embedding`.
- [ ] HNSW similarity index exists.
- [ ] Query endpoint returns nearest chunks.
- [ ] RAG answer endpoint provides grounded, cited answers.
