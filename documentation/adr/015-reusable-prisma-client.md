# ADR-015: Use a reusable Prisma client, but ensure it actually exists

**Status:** Accepted

## Context

Instantiating a new `PrismaClient` per request or per hot-reload cycle in
development can exhaust database connections.

## Decision

Export a reusable Prisma client module (`lib/prisma.ts`) for use outside
direct configuration, using the standard Next.js development-safe
singleton pattern to avoid excessive clients during hot reload.

## Rationale

- Creates one clear import boundary for database access.
- Avoids creating repeated clients in development.
- Keeps database integration consistent with the S3 integration pattern
  (see [ADR-004](004-thin-routes-isolated-services.md)).

## Alternatives considered

- **Assume a Prisma helper exists because Prisma is configured elsewhere,
  or instantiate clients ad hoc across route handlers.** Rejected — this is
  the mistake ADR-004 explicitly calls out as having actually happened once.

## Consequences

None significant; `lib/prisma.ts` exists and is imported by both API
routes as of this writing.

## Revisit when

The application adopts dependency injection, an ORM replacement,
serverless connection pooling, or a data-access layer.
