# ADR-005: Validate uploads before expensive side effects

**Status:** Accepted

## Context

Uploading first and discovering an invalid file afterward wastes network,
storage, and database work, and produces confusing failure states.

## Decision

Validate the incoming upload before S3 or database work. Validation order:

1. a value exists;
2. the value is a `File`;
3. MIME type is an allowed PDF type;
4. size is within the limit.

## Rationale

- Fails fast and returns useful client errors.
- Prevents avoidable storage, network, and database work.
- Makes the upload contract explicit.

## Alternatives considered

- **Upload first, then discover invalid type, missing file, or excessive
  size.** Rejected — wastes work and leaves ambiguous partial state.

## Consequences

None significant; this is the current behavior in
`app/api/upload/route.ts`.

## Revisit when

Requirements expand to multiple file types, content sniffing, malware
scanning, tenant-specific quotas, or larger uploads.
