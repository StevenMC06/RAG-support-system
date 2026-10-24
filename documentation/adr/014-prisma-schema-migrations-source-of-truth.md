# ADR-014: Prisma schema and migrations are the database source of truth

**Status:** Accepted

## Context

Manually editing tables in a database UI produces undocumented, unreplayable state.

## Decision

Define schema changes in `prisma/schema.prisma`, then apply versioned
Prisma migrations (`prisma/migrations/`). Commit migration history; do not
manually edit production/development tables as the normal workflow.

## Rationale

- Migrations version the database alongside application code.
- A new contributor can reproduce the schema consistently.
- Schema evolution remains auditable.

## Alternatives considered

- **Manually create or alter tables in a database UI** and rely on
  undocumented state. Rejected.

## Consequences

Every schema change requires a migration, including non-standard ones like
enabling the `vector` extension (see
[ADR-019](019-pgvector-for-embeddings.md) and
[operations/local-development.md](../operations/local-development.md) for
the shadow-database complication this caused in practice).

## Revisit when

The project adopts a different migration tool. Preserve the
migration-first discipline.
