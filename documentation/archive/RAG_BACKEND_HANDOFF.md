# RAG Support System — Backend Handoff

## Purpose of this document

This is the implementation and decision-making handoff for the RAG Support System. It is intended for another AI agent or backend engineer who should continue the existing architecture, not redesign it.

The project is a production-oriented learning/portfolio build: ingest PDFs, extract and chunk their text, create embeddings, retrieve semantically relevant chunks, and ultimately generate grounded support answers with citations.

**Current milestone:** upload, extraction, chunking, batch embedding generation, PostgreSQL, and pgvector schema setup are complete. The next required task is to **persist generated embeddings into `DocumentChunk.embedding`**. Until that is done, this is a document chunking pipeline—not a retrievable RAG index.

## Project overview

### Target architecture

```text
Browser
  |
  | POST /api/upload (PDF)
  v
S3 object storage <----- PostgreSQL metadata (`Document`)
  |
  | POST /api/extract ({ documentId })
  v
Download PDF -> extract text -> semantic/token-aware chunks
  -> OpenAI embeddings -> PostgreSQL (`DocumentChunk` + pgvector)
  -> later: semantic retrieval -> grounded LLM answer
```

### Stack

- Next.js API routes
- TypeScript
- Prisma (relational access and migrations)
- PostgreSQL 17 in Docker
- pgvector extension for embedding storage and similarity search
- Amazon S3 for original PDF bytes
- OpenAI embeddings using `text-embedding-3-small`
- `pdf-parse` / `PDFParse` for text extraction

## Completed phases

### Phase 1 — PDF upload: complete

`POST /api/upload` accepts a PDF, validates it, uploads its bytes to S3, and creates a metadata row in PostgreSQL.

Implemented safeguards:

- PDF-only input validation
- Presence and `File` validation
- 10 MB maximum upload size
- S3 storage paths generated with `randomUUID()`
- Filename sanitization (the user explicitly caught issues caused by dots/filename splitting)
- Document status initially set to `uploaded`

### Phase 2 — extraction and chunk persistence: complete

`POST /api/extract`:

1. Validates `documentId`.
2. Finds the `Document` metadata row.
3. Downloads the PDF from S3 using `storagePath`.
4. Extracts its text with `PDFParse`.
5. Splits text into semantic, token-aware chunks.
6. Deletes prior chunks for that document.
7. Inserts the fresh chunks into `DocumentChunk`.

Reprocessing is intentionally idempotent: old chunks are deleted before fresh chunks are created, avoiding duplicate/obsolete chunks.

### Phase 3 — embeddings: partially complete

Completed:

- `lib/embeddings.ts` uses OpenAI's `text-embedding-3-small`.
- Embeddings were upgraded from one-at-a-time calls to batched calls.
- The route verifies `embeddings.length === chunks.length` before persistence.
- A real test of document ID `6` succeeded: **19 chunks -> 19 embeddings -> 1,536 dimensions each**.
- PostgreSQL was upgraded to a pgvector-enabled image, the extension was enabled, and an `embedding vector(1536)` column was migrated onto `DocumentChunk`.

Not completed:

- Generated `number[]` embedding arrays are not yet saved. Current `createMany` persists chunk text metadata only.

## Current state and immediate blocker

The relevant shape of `app/api/extract/route.ts` is:

```ts
const chunks = chunkText(result.text, {
  targetTokens: 500,
  maxTokens: 600,
  overlapTokens: 75,
});

const embeddings = await createEmbeddings(
  chunks.map((chunk) => chunk.content)
);

await prisma.documentChunk.deleteMany({
  where: { documentId: document.id },
});

await prisma.documentChunk.createMany({
  data: chunks.map((chunk) => ({
    documentId: document.id,
    chunkIndex: chunk.chunkIndex,
    content: chunk.content,
    tokenCount: chunk.tokenCount,
  })),
});
```

`embeddings` is created but disappears at request completion. Prisma represents pgvector as `Unsupported("vector(1536)")`, so `createMany` cannot directly write the vector field.

**Do next:** insert chunk rows, then persist each vector using parameterized Prisma raw SQL (or a safe all-in-one raw insert). Preserve the positional invariant:

```text
chunks[i] <-> embeddings[i]
```

Use a vector literal such as `[0.12,-0.03,...]`, cast it with `::vector`, and identify the row by `documentId` plus `chunkIndex`. Prefer Prisma's parameterized raw-SQL mechanism; do not interpolate embedding strings or identifiers into unsafe SQL unnecessarily.

After implementation, verify one row explicitly:

```sql
SELECT id, "documentId", "chunkIndex", embedding IS NOT NULL AS has_embedding
FROM "DocumentChunk"
WHERE "documentId" = 6
LIMIT 1;
```

Only after this verification should retrieval/index work begin.

## Architectural decisions

### S3 stores files; PostgreSQL stores application data

The original PDF bytes belong in S3. PostgreSQL stores queryable metadata and derived knowledge records:

- `Document`: filename, S3 path, type, size, status, timestamps
- `DocumentChunk`: chunk text, sequence number, token count, and eventually embedding

This avoids using the relational database as object storage while retaining transactional, queryable application state.

### UUID-based storage paths, not filenames

S3 object keys are generated with UUIDs rather than `file.name`.

Why:

- Multiple uploads can have the same name.
- Filenames are user-controlled and can be guessable.
- UUIDs decouple internal storage identity from display names.
- Sanitizing display filenames still matters, especially where extension/path parsing is involved.

The filename remains useful metadata; it is not the storage identifier.

### Document-to-chunk is one-to-many

Each `DocumentChunk` has its own primary key. `documentId` is a foreign key, allowing one document to have many chunks. `@@unique([documentId, chunkIndex])` prevents duplicate positions within a document while allowing every document to start at chunk index 0.

### Semantic, token-aware chunking instead of fixed character lengths

The chunker works conceptually as:

```text
Paragraph -> sentence -> token-aware grouping -> overlap
```

Current settings:

```text
targetTokens: 500
maxTokens:    600
overlapTokens: 75
```

The target is intentionally not a minimum. A shorter chunk at a natural document boundary is valid and preferred to combining unrelated content. Overlap preserves context across boundaries, as confirmed by repeated page markers in test output.

### Batch embeddings

Embedding all chunk texts in one OpenAI request is preferred over one request per chunk. It reduces request overhead, is simpler, and retains input/output order for deterministic chunk-vector pairing.

### pgvector, not a dedicated vector database—for now

pgvector is a PostgreSQL extension, not a separate database or company. It adds the `vector(1536)` data type, distance operators such as `<=>`, and vector indexes.

It was selected because the project already uses Postgres for documents and chunks. Benefits:

- One durable data system for relational metadata and embeddings
- SQL joins and transactional consistency
- Lower cost and operational burden
- A strong fit for an MVP/small-to-medium corpus

Tradeoff: a dedicated vector database (Pinecone, Weaviate, Milvus) can offer specialized features and better performance at extremely large scale, but adds another service, another bill, and a synchronization problem. Milvus-scale infrastructure would be overkill here. Revisit only after actual dataset/latency requirements prove Postgres is insufficient.

### Prisma with custom pgvector types

Prisma owns normal relational reads/writes and migration history. It does not natively model pgvector as an ordinary Prisma scalar, so the schema uses:

```prisma
embedding Unsupported("vector(1536)")?
```

Raw SQL is an intentional, limited escape hatch for vector writes/searches—not a reason to abandon Prisma or replace the database.

### Production tooling philosophy

The user repeatedly asked *why* before moving forward and explicitly wanted production-oriented choices instead of “vibe coding” or papering over failures.

This led to several operating principles:

- Preserve existing infrastructure/data before changes (e.g., verify Docker mounts before replacing a container).
- Keep migrations reproducible; do not skip the Prisma migration system.
- Inspect generated migrations for custom database types before applying them.
- Make extension creation part of migration history so a new developer/shadow database is not dependent on tribal knowledge.
- Validate each pipeline boundary with real output before proceeding.
- Prefer reusable API request collections (Bruno was suggested) over repeatedly reconstructing ad-hoc curl commands.

### Future worker boundary (design direction, not yet implemented)

The current endpoint embeds synchronously during extraction. A future production shape should split processing responsibilities:

```text
Upload -> extract/chunk/persist -> background embedding worker -> persist vectors
```

For the MVP, completing synchronous vector persistence is acceptable. Keep the code boundaries clean so a queue/worker can be introduced later without redesigning the data model.

## Database schema

Approximate current Prisma model shape (confirm exact fields against the repository):

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

The actual database column is `embedding vector(1536)`, matching the default 1,536 dimensions returned by `text-embedding-3-small` in this project.

## pgvector and Docker history

- The original Docker image was `postgres:17`; it did not include pgvector binaries.
- The database files were verified to be in the named Docker volume `rag-support-system_postgres_data`.
- Only the container was replaced; the volume was deliberately retained.
- The active container image became `pgvector/pgvector:pg17` and continues using port `5433` on the host.
- `CREATE EXTENSION IF NOT EXISTS vector;` succeeded; the verified extension version was `0.8.6`.
- An image swap produced a PostgreSQL collation-version mismatch (`2.41` vs `2.36`) that blocked Prisma's shadow database creation. This was repaired in both `template1` and `rag_support` by reindexing and refreshing collation metadata.
- The vector migration initially failed in Prisma's shadow database because the custom `vector` type was not enabled there. The migration was corrected to run `CREATE EXTENSION IF NOT EXISTS vector;` before adding `embedding vector(1536)`.

Do not remove Docker volumes or replace the database container without first confirming the data mount and preserving it.

## API endpoints

### `POST /api/upload`

Input: multipart/form-data containing a PDF.

Behavior:

1. Validate file type/object/size.
2. Generate a UUID-backed S3 storage key.
3. Upload the PDF to S3.
4. Create a `Document` record.
5. Return the document identifier.

### `POST /api/extract`

Input:

```json
{ "documentId": 6 }
```

Behavior:

1. Validate the numeric document ID.
2. Find document metadata or return 404.
3. Download the S3 object.
4. Extract PDF text.
5. Chunk with semantic/token-aware settings.
6. Batch-create embeddings.
7. Guard against a chunk/embedding count mismatch.
8. Replace stale chunks and persist fresh data.

Current gap: step 8 does not yet write the vectors.

### Planned `POST /api/search`

Input should be a user question, plus an optional result count/filter.

Behavior:

1. Create an embedding for the question using the same embedding model.
2. Query `DocumentChunk` ordered by `embedding <=> queryVector`.
3. Return top-K chunks and useful metadata (document ID, chunk index, distance).

## Remaining work

### Required next milestone: reliable embedding persistence

1. Update the extract persistence path to store every embedding beside its chunk.
2. Keep the delete/create/vector-write sequence consistent—prefer a transaction where practical so an incomplete reprocess does not leave misleading data.
3. Verify `embedding IS NOT NULL` and the expected dimension for a real chunk row.
4. Add clear errors/logs for persistence failures.

### Retrieval milestone

1. Add a pgvector similarity index, normally HNSW, after real vectors are present.
2. Use the correct operator class for the selected distance metric. `<=>` is cosine distance; for an HNSW cosine index this generally means `vector_cosine_ops`.
3. Implement `/api/search` with parameterized raw SQL and top-K limits.
4. Test queries against a known document and inspect relevance, not just successful HTTP status.

### Full RAG milestone

1. Add a chat/answer endpoint.
2. Retrieve relevant chunks first.
3. Send only retrieved context and the user question to the generation model.
4. Return source citations tied to documents/chunks.
5. Add observability, retry/error handling, and a basic UI.

## Concrete next-step instructions for the next agent

1. Inspect the current repository state first. Do not assume the earlier route line numbers still match.
2. Confirm the migration contains extension creation before its `vector(1536)` DDL and that the existing database already has the column.
3. Modify only the embedding-persistence portion of `app/api/extract/route.ts` (and closely related helpers/tests if necessary). Avoid architecture rewrites.
4. Insert normal chunk rows with Prisma, then save each corresponding vector with parameterized raw SQL. Maintain `chunks[i]`/`embeddings[i]` pairing exactly.
5. Make reprocessing safe: stale chunks must not coexist with new vectors, and write failures should be handled deliberately. Use a transaction if compatible with the chosen raw-SQL approach.
6. Run the extraction endpoint for an existing PDF, preferably document ID `6` if it still exists.
7. Verify a `DocumentChunk` row has a non-null `embedding`; also verify the row count matches the chunk count.
8. Report the exact validation query/result before advancing to indexing or search.
9. Then create an HNSW vector index and implement `/api/search`; do not build the final chat endpoint before retrieval is independently verified.

## Guardrails

- Do not switch away from PostgreSQL + pgvector unless there is a demonstrated scale requirement.
- Do not use a plain `postgres:17` Docker image; the active database image must include pgvector.
- Do not bypass or discard Prisma migration history.
- Do not use string-concatenated SQL for user-controlled values; parameterize raw SQL.
- Do not add a similarity index before confirming embeddings are actually stored.
- Do not treat “HTTP 200” as proof of success—verify persisted vectors and retrieval relevance in the database.
- Do not delete/recreate Docker volumes while debugging local infrastructure.

## Verification checklist

- [x] PDF upload to S3 works.
- [x] Document metadata persists in PostgreSQL.
- [x] PDF text downloads and extracts.
- [x] Semantic/token-aware chunking works.
- [x] Chunks persist and can be reprocessed idempotently.
- [x] Batch embedding generation works (19 chunks / 19 vectors / 1,536 dimensions verified).
- [x] pgvector extension is installed and enabled.
- [x] `DocumentChunk.embedding vector(1536)` is migrated.
- [ ] Generated embedding arrays persist to `DocumentChunk.embedding`.
- [ ] HNSW similarity index exists.
- [ ] Query endpoint returns nearest chunks.
- [ ] RAG answer endpoint provides grounded, cited answers.
