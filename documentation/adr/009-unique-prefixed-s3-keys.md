# ADR-009: Use unique S3 object keys, not raw filenames

**Status:** Accepted

## Context

Two uploads can share a filename. Using the original filename as the S3 key
would let a later upload silently overwrite an earlier object.

## Decision

Generate the S3 key with `crypto.randomUUID()` rather than using the
original filename, e.g. `${randomUUID()}.${extension}` (see
`uploadedToS3` in `lib/s3.ts`). The original filename is stored separately
as metadata (`Document.filename`).

## Rationale

- Two files can share a name; raw filenames would overwrite the earlier S3 object.
- The database's `storagePath` is the canonical reference to the object.

## Alternatives considered

- **Original filename as the key.** Accepted only temporarily, to reach the
  first successful S3 upload; superseded by this ADR.

## Consequences

None significant. Note: the current key has no path prefix (e.g. no
`documents/` folder) — see [status.md](../status.md) for this as an open
question, since ADR discussion once assumed a prefixed key.

## Revisit when

Tenant partitioning, versioning, deterministic deduplication, or a
different object naming convention becomes necessary.
