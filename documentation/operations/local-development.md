# Local development

**Last verified against repository:** 2026-09-01 (`compose.yaml`,
`prisma/migrations/`, `prisma/schema.prisma` read directly)

## Database: Docker Compose PostgreSQL + pgvector

`compose.yaml` defines a single service:

```yaml
services:
  postgres:
    image: pgvector/pgvector:pg17
    container_name: rag-postgres
    restart: unless-stopped
    environment:
      POSTGRES_USER: rag_user
      POSTGRES_PASSWORD: rag_password
      POSTGRES_DB: rag_support
    ports:
      - "5433:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
```

Key points:

- **Image is `pgvector/pgvector:pg17`, not plain `postgres:17`.** The
  `vector` extension must be available in the image; a plain Postgres
  image will fail `CREATE EXTENSION IF NOT EXISTS vector;`. See
  [ADR-019](../adr/019-pgvector-for-embeddings.md).
- **Host port is `5433`, not the Postgres default `5432`.** This machine
  already runs a separate Postgres.app instance on `5432` with unrelated
  legacy data (Flight Reservation, Duracell) that must not be touched. See
  [ADR-011](../adr/011-preserve-legacy-postgres-app-port-5433.md). Set
  `DATABASE_URL` to point at `localhost:5433`.
- **`postgres_data` is a named volume.** `docker compose down` removes the
  container but preserves this volume; only `docker compose down -v` (or
  deleting the volume explicitly) destroys data. Never do that without
  confirming you actually mean to discard the local database. See
  [ADR-013](../adr/013-compose-managed-names-and-volumes.md) — note that
  `container_name: rag-postgres` is set explicitly here, which is a
  tracked deviation from that ADR's general preference, not an oversight.

Start/stop:

```bash
docker compose up -d      # start (creates the volume on first run)
docker compose down       # stop; volume is preserved
```

## Prisma

Schema: `prisma/schema.prisma`. This project uses Prisma 7's
`prisma-client` generator with a custom output path:

```prisma
generator client {
  provider = "prisma-client"
  output   = "../app/generated/prisma"
}
```

Migration history (`prisma/migrations/`), oldest first:

1. `20260712234107_init` — creates `Document`.
2. `20260801195653_add_document_chunks` — creates `DocumentChunk` and its
   FK/unique constraint.
3. `20260809224012_add_chunk_embedding` — runs
   `CREATE EXTENSION IF NOT EXISTS vector;` **before** adding the
   `embedding vector(1536)` column.

The extension-creation statement in migration 3 is not incidental: Prisma's
shadow database (used to validate new migrations) doesn't have the `vector`
type enabled by default, so the migration must create the extension itself
rather than assuming it already exists. Per
[ADR-014](../adr/014-prisma-schema-migrations-source-of-truth.md), schema
changes belong in committed migrations — don't hand-edit the database.

**Known history worth knowing if you hit a similar issue:** swapping the
Postgres image (plain → pgvector-enabled) once produced a Postgres
collation-version mismatch (`2.41` vs `2.36`) that blocked shadow-database
creation; it was fixed by reindexing and refreshing collation metadata in
both `template1` and the app database. This isn't automated — if you
change base images again, watch for the same symptom.

Standard commands:

```bash
npx prisma migrate dev      # apply migrations locally, generate client
npx prisma studio            # inspect data
```

## Required environment variables (names only — see `.env`, not committed)

- `DATABASE_URL` — Postgres connection string, port `5433` locally.
- `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`,
  `AWS_BUCKET_NAME` — see
  [operations/aws-and-s3.md](aws-and-s3.md).
- `OPENAI_API_KEY` — used by `lib/embeddings.ts`.

Never commit real values for these; see
[ADR-017](../adr/017-env-vars-for-secrets.md).

## Guardrails carried over from project history

- Do not remove or replace the `postgres_data` volume without first
  confirming the data mount and preserving it.
- Do not stop or reconfigure the existing local Postgres.app installation
  to "free up" port 5432 — it holds unrelated legacy data.
- Prefer applying schema changes through Prisma migrations over editing
  tables directly, even for one-off fixes during development.
