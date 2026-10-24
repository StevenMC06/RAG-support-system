# Ingestion pipeline

**Last verified against repository:** 2026-09-01

Covers everything from `POST /api/upload` through chunk persistence. See
[retrieval-pipeline.md](retrieval-pipeline.md) for what happens after
embeddings exist.

## `POST /api/upload`

Implementation: `app/api/upload/route.ts`, `lib/s3.ts`.

1. Parse `multipart/form-data`, read the `document` field.
2. Validate, in order (per
   [ADR-005](../adr/005-validate-before-side-effects.md)):
   - value is present and is a `File`;
   - `type === "application/pdf"`;
   - `size <= 10 MB` (`MAX_FILE_SIZE` in the route).
3. On success: convert to a `Buffer` via `arrayBuffer()`
   ([ADR-006](../adr/006-pdf-size-limit-and-buffer-strategy.md)), upload to
   S3 under a UUID-based key
   ([ADR-009](../adr/009-unique-prefixed-s3-keys.md)), then create the
   `Document` row **only after** the S3 upload succeeds
   ([ADR-008](../adr/008-s3-upload-before-db-row.md)).
4. Returns `{ success: true, document }` or a 4xx/5xx error.

**Open question, not yet resolved in code:** the archived handoff notes
described filename sanitization as an implemented safeguard ("the user
explicitly caught issues caused by dots/filename splitting"), but the
current route stores `uploadedFile.name` directly as `Document.filename`
with no sanitization step. Confirm whether this was lost in a refactor or
was never actually landed, and either implement it or correct the ADR
record. Tracked in [status.md](../status.md).

## `POST /api/extract`

Implementation: `app/api/extract/route.ts`, `lib/s3.ts`, `lib/chunkTest.ts`,
`lib/embeddings.ts`.

Input:

```json
{ "documentId": 6 }
```

Steps:

1. Validate `documentId` is a `number`.
2. Look up the `Document` row; 404 if missing.
3. Download the PDF bytes from S3 (`downloadFromS3`).
4. Extract text with `PDFParse` (`pdf-parse`).
5. Chunk the text (`chunkText`), with:
   ```text
   targetTokens: 500
   maxTokens:    600
   overlapTokens: 75
   ```
   Chunking is semantic/token-aware
   (paragraph → sentence → token-aware grouping → overlap), counted with
   `js-tiktoken`'s `cl100k_base` encoding. `targetTokens` is a target, not a
   minimum — a shorter chunk at a natural boundary is preferred over
   combining unrelated content.
6. Throw if zero chunks were generated.
7. Batch-embed all chunk texts in one OpenAI call
   (`createEmbeddings`, `text-embedding-3-small`, 1,536 dimensions).
8. Throw if `embeddings.length !== chunks.length`.
9. Delete any existing `DocumentChunk` rows for this document, then
   `createMany` the fresh chunks — reprocessing is intentionally
   idempotent.

**Current gap:** step 9 does not write the `embedding` column. The
computed `embeddings` array is checked for length but never persisted.
Prisma represents `pgvector` as `Unsupported("vector(1536)")`, so it can't
be included in a normal `createMany` call — it needs a parameterized raw
SQL statement after the rows exist. See [status.md](../status.md) for the
exact next step and the verification query to run once it's fixed.

## Data model

From `prisma/schema.prisma`:

```prisma
model Document {
  id          Int             @id @default(autoincrement())
  filename    String
  storagePath String
  fileType    String
  fileSize    Int
  status      String
  uploadedAt  DateTime        @default(now())
  chunks      DocumentChunk[]
}

model DocumentChunk {
  id         Int      @id @default(autoincrement())
  documentId Int
  chunkIndex Int
  content    String
  tokenCount Int
  createdAt  DateTime @default(now())

  embedding Unsupported("vector(1536)")?

  document Document @relation(fields: [documentId], references: [id], onDelete: Cascade)

  @@unique([documentId, chunkIndex])
}
```

`@@unique([documentId, chunkIndex])` prevents duplicate positions within a
document while allowing every document to start at chunk index 0. See
[ADR-007](../adr/007-s3-for-files-postgres-for-metadata.md) for why files
and metadata are split this way.
