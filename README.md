# RAG Support System

A document-ingestion foundation for a retrieval-augmented support application. Built to understand the engineering behind AI-assisted answers: storing source documents, extracting usable text, and persisting chunks.

**Status:** development prototype. Upload, extraction, and chunk persistence are implemented. Embeddings, vector search, and question answering are planned.

## Current capabilities

- Accept PDFs up to 10 MB through `POST /api/upload`.
- Store source files in AWS S3 under UUID-based keys and metadata in PostgreSQL.
- Extract PDF text through `POST /api/extract`.
- Split text with the `cl100k_base` tokenizer: 500 target tokens, 600 maximum, and 75 overlap tokens.
- Persist ordered chunks with a unique `(documentId, chunkIndex)` constraint.

## Architecture

```mermaid
flowchart TD
  Client[Client] --> Upload[Upload API]
  Upload --> S3[(AWS S3)]
  Upload --> DB[(PostgreSQL)]
  Client --> Extract[Extraction API]
  S3 --> Extract
  Extract --> Parse[PDF parsing and token chunking]
  Parse --> DB
```

Next.js route handlers provide the API boundary. S3 holds original PDFs; PostgreSQL holds document metadata and chunks through Prisma. Separating binary storage from structured metadata makes the responsibilities explicit, but requires failure recovery across both services.

Important files: `app/api/upload/route.ts`, `app/api/extract/route.ts`, `lib/s3.ts`, `lib/chunkTest.ts`, and `prisma/schema.prisma`. Despite its name, `chunkTest.ts` contains the chunking implementation; it is not an automated test suite.

## Run locally

Prerequisites: a Node.js version supported by the locked Next.js release, npm, Docker Compose, and an AWS S3 bucket with permission to put and get objects. Use non-sensitive sample PDFs.

```bash
git clone https://github.com/StevenMC06/RAG-support-system.git
cd RAG-support-system
npm ci
docker compose up -d
```

Create an untracked `.env` file:

```dotenv
DATABASE_URL=postgresql://rag_user:rag_password@localhost:5433/rag_support
AWS_REGION=your-aws-region
AWS_BUCKET_NAME=your-development-bucket
AWS_ACCESS_KEY_ID=your-development-access-key
AWS_SECRET_ACCESS_KEY=your-development-secret-key
```

The database credentials match the local Compose configuration and are for local development only. Never commit real AWS credentials.

```bash
npx prisma generate
npx prisma migrate deploy
npm run dev
```

Open http://localhost:3000. These setup commands follow the committed configuration; a fresh end-to-end environment has not yet been verified.

## API smoke check

```bash
curl -X POST http://localhost:3000/api/upload -F 'document=@sample.pdf'
curl -X POST http://localhost:3000/api/extract -H 'Content-Type: application/json' -d '{"documentId":1}'
```

Replace `1` with the ID returned by your upload. Successful extraction returns metadata, chunk count, and a preview of the first three chunks.

## Validation

```bash
npm run lint
npx tsc --noEmit
npm run build
```

These are static/build checks, not behavioral tests. The repository currently has no `npm test` script or CI workflow. Integration checks require the configured database and S3 bucket.

## Engineering decisions and limitations

- **UUID object keys** avoid filename collisions; they do not deduplicate retries.
- **Token-based chunking** makes chunk size explicit for future embedding inputs. Chunk quality and overlap still need retrieval evaluation.
- **Database constraints** prevent duplicate chunk positions, but chunk deletion, insertion, and status updates are not one transaction. Concurrent extraction and interrupted retries need work.
- **Cross-service recovery:** S3 upload can succeed while metadata creation fails, leaving an orphaned object. Cleanup and idempotency are planned.
- **Processing status:** `uploaded` and `processed` track ingestion only. Neither means a document is ready for question answering.
- **API hardening:** authentication, authorization, consistent validation/errors, and removal of PDF-buffer logging remain necessary before public deployment.
- **Execution:** extraction runs within the request. Background jobs and richer retry handling are deferred until ingestion is reliable.

## Next milestones

1. Reproducible setup, focused tests, and CI.
2. Reliable ingestion: atomic chunk replacement, failure states, upload cleanup, and safe retries.
3. Embedding persistence and vector retrieval.
4. Grounded answers with source references and a small evaluation set.

The immediate goal is a trustworthy MVP. Deployment scaling and advanced AWS infrastructure come after the core pipeline works reliably.
