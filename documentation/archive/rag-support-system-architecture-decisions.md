# RAG Support System — Architecture Decision Log

**Status:** living engineering record  
**Scope:** the RAG Support System ingestion foundation through the start of embeddings / `pgvector` work.  
**Purpose:** preserve both the decisions and the learning behind them, so future changes are intentional rather than accidental.

## Learning context

This project is being built to learn production backend and RAG-system fundamentals, not merely to produce a demo quickly. Components are introduced in pipeline order and understood before they are hidden behind abstractions. AI assistance is welcome for syntax and implementation, but it must not silently invent files, configuration, or architectural steps that have not actually been made in the repository.

The guiding principle is: **build a stable ingestion foundation before adding AI features.** The intended pipeline is:

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

---

## ADR-001 — Learn the backend in visible layers

**Decision**  
Build and understand route handlers, `FormData`, validation, Docker, PostgreSQL, Prisma, S3, and the ingestion pipeline explicitly before leaning on high-level AI/RAG abstractions.

**Why**

- The learning goal is transferable system understanding, not only a working output.
- Clear boundaries make debugging possible when real failures occur.
- AI can accelerate implementation once the architecture is understood.

**Rejected alternative**  
Let an agent scaffold the entire backend and RAG pipeline without walking through ownership, data flow, or operational behavior.

**Revisit when**  
The fundamentals are comfortable and speed matters more than learning a particular implementation detail. Continue to preserve architectural review even when using generators.

---

## ADR-002 — Build infrastructure and ingestion before retrieval/chat

**Decision**  
Finish the ingestion path in sequence: upload → storage → metadata → extraction → chunking → embeddings → vector search → chat.

**Why**

- A chat feature cannot be reliable without trustworthy document ingestion and retrieval.
- Each stage produces an inspectable artifact for debugging.
- Avoids partially built subsystems and unclear failures.

**Rejected alternative**  
Jump directly to embeddings, a model call, or chat before the document lifecycle is dependable.

**Revisit when**  
The system needs asynchronous/background processing, queues, or parallel teams working on clearly defined interfaces.

---

## ADR-003 — Treat documentation as part of engineering

**Decision**  
Record every meaningful technical choice with the decision, rationale, alternatives considered, consequences, and revisit trigger.

**Why**

- This project made important decisions that were initially only present in conversation.
- Future-you and collaborators need the reasoning, not just the final code.
- Documentation makes trade-offs visible and reduces re-litigating settled issues.

**Required ADR questions**

1. What did we decide?
2. Why did we decide it?
3. What alternatives did we reject or defer?
4. What changes would cause us to revisit it?

**Revisit when**  
Always. This is a process decision; improve the template as the project matures.

---

## ADR-004 — Keep route handlers thin; isolate external services in `lib/`

**Decision**  
Route handlers own HTTP concerns. External integrations and reusable implementation details live behind focused modules such as `lib/s3.ts`, `lib/prisma.ts`, `lib/pdf.ts`, and `lib/embeddings.ts`.

```text
route.ts: receive request → validate → call services → return response
lib/s3.ts: convert bytes → call AWS → return S3 key
```

**Why**

- Routes stay readable and follow the business flow in English.
- AWS, database, PDF, and embedding code can be changed and tested independently.
- Switching storage providers or adding delete operations affects one integration boundary instead of every route.

**Rejected alternative**  
Put AWS SDK calls, file transformations, local writes, and database logic directly in `app/api/upload/route.ts`.

**Important correction from the project history**  
`lib/prisma.ts` was initially referenced before it had actually been created. Do not assume an importable helper exists: verify the file and its exports before telling someone to import it. Prisma’s schema/configuration outside `lib/` is not a substitute for a `lib/prisma.ts` client module.

**Revisit when**  
The application gains multiple domains or needs a formal service/repository layer. Keep the same responsibility boundaries even if the folder structure changes.

---

## ADR-005 — Validate uploads before expensive side effects

**Decision**  
Validate the incoming upload before S3 or database work. Validation order is:

1. a value exists;
2. the value is a `File`;
3. MIME type is an allowed PDF type;
4. size is within the limit.

**Why**

- Fails fast and returns useful client errors.
- Prevents avoidable storage, network, and database work.
- Makes the upload contract explicit.

**Rejected alternative**  
Upload first, then discover invalid type, missing file, or excessive size.

**Revisit when**  
Requirements expand to multiple file types, content sniffing, malware scanning, tenant-specific quotas, or larger uploads.

---

## ADR-006 — Limit PDFs to 10 MB and use `arrayBuffer()`

**Decision**  
Accept PDFs up to 10 MB and use `await file.arrayBuffer()` followed by `Buffer.from(...)` for upload.

```text
File → ArrayBuffer → Node Buffer → AWS SDK → S3
```

**Why**

- At 10 MB, reading the file into memory is a simple, acceptable trade-off.
- The `File` is a Web API value; the Node/AWS layer accepts a Node `Buffer` comfortably.
- Simplicity supports the learning goal without premature optimization.

**Rejected alternative**  
Use `file.stream()` immediately. Streaming is more memory-efficient but adds complexity that this requirement does not need.

**Revisit when**  
Upload limits rise materially, concurrent traffic makes memory pressure meaningful, or the application accepts large manuals, media, or other large assets.

---

## ADR-007 — Store file bytes in S3 and metadata in PostgreSQL

**Decision**  
PDF bytes live in Amazon S3. PostgreSQL stores document metadata and pipeline state, including fields such as `filename`, `storagePath`/S3 key, `fileType`, `fileSize`, `status`, and `uploadedAt`.

**Why**

- Object storage is the appropriate durable, scalable location for files.
- PostgreSQL remains optimized for structured metadata, relationships, state, and queries.
- Document status can drive ingestion progress: `uploaded` → processing/extracting → chunking/embedding → completed or failed.

**Rejected alternative**  
Store entire PDFs in PostgreSQL or treat S3 as the only system of record with no document metadata.

**Revisit when**  
Compliance, retention, encryption-key, tenancy, or document-versioning requirements change.

---

## ADR-008 — Upload to S3 before creating the database row

**Decision**  
After validation, upload the PDF to S3 first; only create the `Document` row after S3 succeeds.

```text
validate → S3 upload → Prisma document create → response
```

**Why**

- If S3 fails, no row claims a document exists when it does not.
- The database only records successfully stored files.

**Rejected alternative**  
Create the database record first, then upload to S3. A failed S3 call would leave a misleading record.

**Known consequence / deferred work**  
If S3 succeeds but the Prisma insert fails, an orphaned S3 object remains. Add a compensation step to delete the uploaded object (or a reconciliation job) before calling the upload flow production-ready.

**Revisit when**  
The workflow moves to asynchronous ingestion, needs transactional outbox/queue patterns, or starts handling high-value documents requiring durable recovery semantics.

---

## ADR-009 — Use unique, prefixed S3 object keys

**Decision**  
Use a generated key such as `documents/<uuid>.pdf`, e.g. with `crypto.randomUUID()`, rather than the original filename alone. Store the original filename separately as metadata.

**Why**

- Two files can share a name; raw filenames would overwrite the earlier S3 object.
- Prefixes organize storage and support lifecycle policies later.
- The database’s `storagePath` is the canonical reference to the object.

**Temporary earlier approach**  
Original filename as the key was accepted only to reach the first successful S3 upload.

**Revisit when**  
Tenant partitioning, versioning, deterministic deduplication, or a different object naming convention becomes necessary.

---

## ADR-010 — Use Docker Compose PostgreSQL for this new project

**Decision**  
The RAG Support System owns a Docker Compose PostgreSQL service, its Compose file, and its persistent volume.

**Why**

- It is reproducible and isolated from machine-wide setup.
- A project can be started with its dependencies rather than relying on undocumented local state.
- Containers may be recreated while the named volume retains database data.

**Key mental model**

```text
Project → compose.yaml → services → containers → volumes
```

**Rejected alternative**  
Use a shared, unmanaged local PostgreSQL installation for all new work.

**Revisit when**  
Development needs additional services (e.g. Redis, worker), integration tests, or a remote/staging database. Keep per-project ownership.

---

## ADR-011 — Preserve legacy Postgres.app; use port 5433 for RAG Docker PostgreSQL

**Decision**  
Existing Postgres.app databases remain untouched because they contain active/valuable legacy project data. The RAG PostgreSQL container maps host port `5433` to container port `5432`; Prisma connects to the RAG database at `localhost:5433`.

**Why**

- Inventory revealed existing Flight Reservation and Duracell tables, including a legacy database with mixed projects.
- Replacing or uninstalling the local server before backup/migration would risk data loss.
- Keeping the environments separate resolves the port conflict without disrupting prior work.

**Rejected alternative**  
The initial proposal to stop Postgres.app so Docker could take port 5432. This was explicitly superseded after discovering real data.

**Revisit when**  
Legacy projects are backed up and deliberately migrated to Docker. At that point, standardizing Docker on 5432 may be reasonable.

---

## ADR-012 — One database and one Compose project per application

**Decision**  
Each application receives its own PostgreSQL database and its own Compose project/infrastructure boundaries.

**Why**

- A legacy `stevencarmona` database mixed Flight Reservation and Duracell tables, making ownership and maintenance unclear.
- Isolation clarifies backup, schema evolution, deletion risk, and service ownership.

**Rejected alternative**  
Put unrelated applications into a single shared database by default.

**Revisit when**  
Multiple bounded services intentionally share a database under a documented ownership model. This should be exceptional, not the starting point.

---

## ADR-013 — Let Docker Compose manage names and persistent data

**Decision**  
Prefer Compose-managed container names and project grouping; avoid unnecessary `container_name` overrides. Treat volumes as data-bearing assets and containers as replaceable runtime instances.

**Why**

- Compose’s project/service names stay clean in Docker Desktop and avoid collisions.
- `docker compose down` removes containers and networks but preserves named volumes by default.
- The distinction avoids accidental data loss: deleting a container is not the same as deleting its volume.

**Rejected alternative**  
Manually manage Docker Desktop items or use forced global container names for cosmetic organization.

**Revisit when**  
An external integration specifically requires a fixed container name.

---

## ADR-014 — Prisma schema and migrations are the database source of truth

**Decision**  
Define schema changes in `prisma/schema.prisma`, then apply versioned Prisma migrations. Commit migration history; do not manually edit production/development tables as the normal workflow.

**Why**

- Migrations version the database alongside application code.
- A new contributor can reproduce the schema consistently.
- Schema evolution remains auditable.

**Rejected alternative**  
Manually create or alter tables in a database UI and rely on undocumented state.

**Revisit when**  
The project adopts a different migration tool. Preserve the migration-first discipline.

---

## ADR-015 — Use a reusable Prisma client, but ensure it actually exists

**Decision**  
Create and export a reusable Prisma client module (typically `lib/prisma.ts`) when the application needs Prisma outside direct configuration. Use the standard Next.js development-safe singleton pattern to avoid excessive clients during hot reload.

**Why**

- Creates one clear import boundary for database access.
- Avoids creating repeated clients in development.
- Keeps database integration consistent with the S3 integration pattern.

**Rejected alternative**  
Assume a Prisma helper exists because Prisma is configured elsewhere, or instantiate clients ad hoc across route handlers.

**Revisit when**  
The application adopts dependency injection, an ORM replacement, serverless connection pooling, or a data-access layer.

---

## ADR-016 — IAM authentication, least privilege, and private S3

**Decision**  
Use a dedicated IAM identity for the backend rather than AWS root credentials. Keep S3 public access blocked, ACLs disabled, and server-side encryption enabled. Use a consistent region (`us-west-2` was selected) and establish billing/budget alerts.

**Why**

- IAM separates authentication (access key/secret) from authorization (policy).
- Root credentials are too powerful for application use.
- Private PDFs should be accessed by the backend, not the public internet.
- Budget alerts protect a learning project from unexpected spend.

**Temporary concession**  
`AmazonS3FullAccess` was accepted to unblock the first learning integration.

**Required hardening / rejected long-term alternative**  
Do not keep broad account-wide S3 permissions. Replace with a custom, bucket-scoped policy that grants only the required object actions (currently upload/read; delete only if compensation cleanup needs it).

**Revisit when**  
Before production, when adding deployment credentials, presigned URLs, multiple environments, or a background worker. Prefer roles/workload identity over long-lived access keys in deployed environments.

---

## ADR-017 — Secrets and configuration belong in environment variables

**Decision**  
Keep `DATABASE_URL`, AWS credentials, AWS region, and bucket name in local environment configuration, never hardcoded in source or committed to Git.

**Why**

- Credentials must not be exposed in the repository or logs.
- Configuration varies between local, test, staging, and production environments.
- Debugging should confirm whether a secret exists, not print the secret.

**Rejected alternative**  
Hardcode access keys, database credentials, region, or bucket name in application code.

**Revisit when**  
Moving to deployment: use the platform’s secret manager and rotate any long-lived credentials that have been exposed or are no longer needed.

---

## ADR-018 — Maintain a practical documentation structure

**Decision**  
Maintain repository documentation under `docs/`, including ADRs, architecture diagrams/narratives, pipeline descriptions, operational setup, and learning notes.

**Suggested structure**

```text
docs/
  adr/
    001-upload-pipeline.md
    002-storage-strategy.md
    003-docker-and-database-strategy.md
    004-vector-storage.md
  architecture/
    system-overview.md
    ingestion-pipeline.md
    retrieval-pipeline.md
  operations/
    local-development.md
    aws-and-s3.md
  learning/
    backend-notes.md
    postgres-notes.md
```

**Why**  
The documentation should form the project’s memory: it explains what exists, why it exists, and how to safely operate or change it.

**Revisit when**  
Documentation becomes repetitive. Consolidate stable reference material, but retain ADRs as immutable historical decisions with superseding ADRs rather than rewriting history.

---

## Current/next RAG decision: embeddings and `pgvector`

The referenced work has progressed to embeddings and `pgvector`, but the exact implementation decisions from the continuation are not available in this conversation export. Add an ADR before finalizing that work. At minimum, document:

- embedding provider and model, including dimensionality and cost/latency rationale;
- chunk size, overlap, boundary strategy, and metadata stored per chunk;
- `pgvector` column type, distance metric, index type and parameters;
- how `Document` and `Chunk` records relate;
- ingestion status/error/retry behavior;
- retrieval top-k, filtering, and source/citation behavior;
- rebuild/re-embedding strategy when the embedding model or chunking rules change.

---

# Prompt for a Cursor agent: generate and maintain repository documentation

Copy the following prompt into Cursor at the repository root.

```text
You are the documentation steward for this RAG Support System repository. Your job is to inspect the actual code, Prisma schema/migrations, Docker Compose configuration, environment-variable examples, and existing docs, then create or update documentation that matches the repository exactly. Do not invent files, imports, commands, configuration, providers, or implementation status. If something is unclear or missing, state it as an open question/TODO rather than guessing.

Learning context: this project is intentionally teaching backend and RAG architecture through visible layers. Explain decisions plainly enough for the project owner to learn from them, but keep code and operational documentation accurate and practical. Documentation is a first-class engineering deliverable.

Create or maintain this structure where it fits the repository:

- README.md: concise project purpose, local quick start, required configuration names (never secret values), and links to deeper docs.
- docs/architecture/system-overview.md: the end-to-end flow from upload through retrieval/chat. Clearly distinguish what is implemented from what is planned.
- docs/architecture/ingestion-pipeline.md: request handling, validation, S3 storage, metadata persistence, extraction, chunking, embeddings, pgvector storage, states, and failure boundaries.
- docs/architecture/retrieval-pipeline.md: query embedding, vector search, filtering, context construction, citations, and answer generation. Mark any unimplemented stage clearly.
- docs/operations/local-development.md: Docker Compose ownership, database name/host port, Prisma migration workflow, how to start/stop services safely, and the difference between containers and volumes.
- docs/operations/aws-and-s3.md: S3 purpose, object-key strategy, IAM identity/policy expectations, private-access posture, required environment-variable names, and credential-safety rules.
- docs/adr/: numbered Architecture Decision Records. Use the format: Status, Context, Decision, Rationale, Alternatives considered/rejected, Consequences, and Revisit conditions.
- docs/learning/: short, useful notes only where they reinforce the project’s learning goals; do not duplicate architecture docs.

Seed or preserve ADRs for these decisions (verify implementation status first):

1. Learn backend fundamentals before relying on AI/RAG abstractions.
2. Build the ingestion foundation before retrieval/chat.
3. Keep route handlers thin and isolate integrations in focused `lib/` modules.
4. Validate a file before storage/database side effects.
5. Use a 10 MB PDF limit and `arrayBuffer()`/Node `Buffer` for current uploads; streaming is deferred.
6. Store PDF bytes in S3 and document metadata/status in PostgreSQL.
7. Upload to S3 before inserting the document record; document compensation/cleanup if DB persistence fails after S3 succeeds.
8. Use unique, prefixed S3 object keys; store the original filename as metadata.
9. Use project-owned Docker Compose PostgreSQL, one database per project, and preserve persistent volumes.
10. Preserve legacy Postgres.app data; this RAG project uses Docker PostgreSQL on host port 5433 unless the repository now shows a deliberate change.
11. Use Prisma schema plus committed migrations as the database source of truth.
12. Use a reusable Prisma client only when the module actually exists; avoid undocumented imports and hot-reload connection issues.
13. Use dedicated IAM credentials, private S3 access, environment variables for secrets, and bucket-scoped least-privilege permissions. If broad S3 permissions remain, document them as temporary technical debt.
14. Document pgvector/embedding choices once verified from code: provider/model, dimensions, chunking, distance metric, index, retrieval settings, re-embedding plan, and error/retry behavior.

Quality rules:

- Use Markdown with clear headings and compact diagrams when they clarify a flow.
- Every claim about implementation must be traceable to a repository file; link to relevant paths when useful.
- Never include real secret values or request that they be pasted.
- Do not rewrite old ADRs to erase history. Mark them superseded and create a new ADR when a decision changes.
- Add a short “Last verified against repository” note with the current date to documents you materially update.
- Keep README concise; move detail into docs.
- Before finishing, verify internal Markdown links and ensure docs do not contradict the current implementation.

First, give me a brief inventory of existing documentation and mismatches you found. Then make the documentation changes, and summarize: files created/updated, decisions documented, open questions, and any implementation/documentation discrepancy that should be resolved.
```
