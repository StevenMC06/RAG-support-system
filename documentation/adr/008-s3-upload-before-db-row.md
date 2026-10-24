# ADR-008: Upload to S3 before creating the database row

**Status:** Accepted

## Context

The upload flow writes to two systems (S3 and PostgreSQL) that aren't
transactional together. The order in which they're written determines what
kind of inconsistency is possible on partial failure.

## Decision

After validation, upload the PDF to S3 first; only create the `Document`
row after S3 succeeds.

```text
validate → S3 upload → Prisma document create → response
```

## Rationale

- If S3 fails, no row claims a document exists when it does not.
- The database only records successfully stored files.

## Alternatives considered

- **Create the database record first, then upload to S3.** Rejected — a
  failed S3 call would leave a misleading record that claims a file exists.

## Consequences

**Known gap, not yet fixed:** if S3 succeeds but the Prisma insert fails, an
orphaned S3 object remains. This needs a compensation step (delete the
uploaded object) or a reconciliation job before the upload flow can be
called production-ready. Track this in [status.md](../status.md).

## Revisit when

The workflow moves to asynchronous ingestion, needs transactional
outbox/queue patterns, or starts handling high-value documents requiring
durable recovery semantics.
