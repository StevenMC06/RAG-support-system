# Documentation

This folder is the project's engineering memory: what was decided, why,
how the system actually works today, and how to operate it. See
[ADR-018](adr/018-documentation-structure.md) for why it's organized this
way, and [ADR-003](adr/003-documentation-as-engineering.md) for why this
folder exists at all — this project has already lost decision context once
by keeping it only in chat history.

## Layout

```text
documentation/
  README.md              — this file
  adr/                    — numbered Architecture Decision Records (rarely changes)
  architecture/           — how the system works today (updated as it changes)
  operations/             — how to run/operate it locally and in AWS
  status.md               — current milestone, blockers, checklist (changes often)
  archive/                — superseded monolithic docs, kept verbatim for history
```

**Start here depending on what you need:**

- Streaming feature PR handoff → [review handoff](handoffs/streaming-chat.md)

- Planned local-first platform and feature sequence → [platform roadmap](architecture/platform-roadmap.md)
- Implemented request/call IDs and timing → [request timing](operations/request-timing.md)
- Streaming API, browser behavior, and measurements → [streaming chat](operations/streaming-chat.md)

- Understand the current state and what to do next → [status.md](status.md)
- Understand how the system works → [architecture/system-overview.md](architecture/system-overview.md)
- Run it locally → [operations/local-development.md](operations/local-development.md)
- AWS/S3 setup and credential handling → [operations/aws-and-s3.md](operations/aws-and-s3.md)
- Understand *why* something is built the way it is → [adr/](adr/), browse by filename or grep for a keyword

## Architecture Decision Records (`adr/`)

Each ADR is one decision: what we chose, why, what we rejected, and what
would make us revisit it. They're numbered in the order they were made and
are meant to stay immutable — see [ADR-018](adr/018-documentation-structure.md).

| ADR | Decision |
|---|---|
| [001](adr/001-learn-backend-in-visible-layers.md) | Learn the backend in visible layers before AI/RAG abstractions |
| [002](adr/002-ingestion-before-retrieval.md) | Build ingestion before retrieval/chat |
| [003](adr/003-documentation-as-engineering.md) | Treat documentation as part of engineering |
| [004](adr/004-thin-routes-isolated-services.md) | Keep route handlers thin; isolate services in `lib/` |
| [005](adr/005-validate-before-side-effects.md) | Validate uploads before expensive side effects |
| [006](adr/006-pdf-size-limit-and-buffer-strategy.md) | 10 MB PDF limit; `arrayBuffer()`/`Buffer` over streaming |
| [007](adr/007-s3-for-files-postgres-for-metadata.md) | S3 for file bytes, PostgreSQL for metadata |
| [008](adr/008-s3-upload-before-db-row.md) | Upload to S3 before creating the DB row |
| [009](adr/009-unique-prefixed-s3-keys.md) | UUID-based S3 keys, not raw filenames |
| [010](adr/010-docker-compose-postgres-ownership.md) | Project-owned Docker Compose PostgreSQL |
| [011](adr/011-preserve-legacy-postgres-app-port-5433.md) | Preserve legacy Postgres.app; RAG DB on port 5433 |
| [012](adr/012-one-database-per-application.md) | One database and Compose project per application |
| [013](adr/013-compose-managed-names-and-volumes.md) | Let Compose manage names; volumes hold the real data |
| [014](adr/014-prisma-schema-migrations-source-of-truth.md) | Prisma schema + migrations are the DB source of truth |
| [015](adr/015-reusable-prisma-client.md) | Reusable Prisma client, verified to actually exist |
| [016](adr/016-iam-least-privilege-private-s3.md) | Dedicated IAM identity, least privilege, private S3 |
| [017](adr/017-env-vars-for-secrets.md) | Secrets and config live in environment variables |
| [018](adr/018-documentation-structure.md) | This documentation structure |
| [019](adr/019-pgvector-for-embeddings.md) | pgvector over a dedicated vector database |
| [020](adr/020-embedding-provider-and-model.md) | OpenAI `text-embedding-3-small`, batched |

## Adding a new ADR

1. Copy [adr/template.md](adr/template.md) to `adr/0NN-short-slug.md`,
   using the next unused number.
2. Fill in Context, Decision, Rationale, Alternatives considered,
   Consequences, Revisit when.
3. Add a row to the table above.
4. If it changes a previous decision, don't edit the old ADR's Decision —
   set its **Status** to `Superseded by ADR-0NN` and explain why in the new
   one.

## Keeping this current

When you materially update a doc, add or refresh its
"Last verified against repository" line with the current date. If you
notice the docs disagree with the actual code, don't silently pick one —
add it to the "Open discrepancies" section of [status.md](status.md) and
resolve it deliberately (fix the code, or correct the doc).

## `archive/`

`rag-support-system-architecture-decisions.md` and
`RAG_BACKEND_HANDOFF.md` are the original monolithic docs this structure
was extracted from. They're kept verbatim, unedited, as the historical
record — don't update them; update the split-out files above instead.
