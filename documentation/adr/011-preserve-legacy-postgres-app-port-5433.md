# ADR-011: Preserve legacy Postgres.app; use port 5433 for RAG Docker PostgreSQL

**Status:** Accepted

## Context

An inventory of the local machine's existing Postgres.app installation
revealed active/valuable legacy data (Flight Reservation and Duracell
tables, mixed into one legacy database). The default PostgreSQL port 5432
was already in use by that installation, creating a conflict with the new
Dockerized database.

## Decision

Existing Postgres.app databases remain untouched. The RAG PostgreSQL
container maps host port `5433` to container port `5432` (see
`compose.yaml`); Prisma connects to the RAG database at `localhost:5433`.

## Rationale

- Replacing or uninstalling the local server before backup/migration would risk data loss.
- Keeping the environments separate resolves the port conflict without disrupting prior work.

## Alternatives considered

- **Stop Postgres.app so Docker could take port 5432.** This was the
  initial proposal; explicitly superseded after discovering real data at
  risk.

## Consequences

Anyone connecting to the RAG database locally must use port `5433`, not the
PostgreSQL default. Document this clearly in
[operations/local-development.md](../operations/local-development.md) so
it isn't rediscovered by trial and error.

## Revisit when

Legacy projects are backed up and deliberately migrated to Docker. At that
point, standardizing Docker on 5432 may be reasonable.
