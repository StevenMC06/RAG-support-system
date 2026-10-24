# ADR-007: Store file bytes in S3 and metadata in PostgreSQL

**Status:** Accepted

## Context

PDF bytes and their structured metadata have different storage needs and
access patterns.

## Decision

PDF bytes live in Amazon S3. PostgreSQL stores document metadata and
pipeline state: `filename`, `storagePath` (S3 key), `fileType`, `fileSize`,
`status`, `uploadedAt` (see the `Document` model in `prisma/schema.prisma`).

## Rationale

- Object storage is the appropriate durable, scalable location for files.
- PostgreSQL remains optimized for structured metadata, relationships, state, and queries.
- Document status can drive ingestion progress: `uploaded` → processing/extracting → chunking/embedding → completed or failed.

## Alternatives considered

- **Store entire PDFs in PostgreSQL**, or **treat S3 as the only system of
  record with no document metadata.** Both rejected — neither fits the
  natural storage pattern of the two systems.

## Consequences

Two systems must stay consistent (see
[ADR-008](008-s3-upload-before-db-row.md) for ordering and the known
orphaned-object gap).

## Revisit when

Compliance, retention, encryption-key, tenancy, or document-versioning
requirements change.
