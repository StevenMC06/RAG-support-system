# ADR-010: Use Docker Compose PostgreSQL for this project

**Status:** Accepted

## Context

Local development needs a reproducible database that doesn't depend on
undocumented machine-wide state.

## Decision

The RAG Support System owns a Docker Compose PostgreSQL service, its
Compose file (`compose.yaml`), and its persistent volume.

## Rationale

- It is reproducible and isolated from machine-wide setup.
- A project can be started with its dependencies rather than relying on undocumented local state.
- Containers may be recreated while the named volume retains database data.

```text
Project → compose.yaml → services → containers → volumes
```

## Alternatives considered

- **Use a shared, unmanaged local PostgreSQL installation** for all new
  work. Rejected — see [ADR-011](011-preserve-legacy-postgres-app-port-5433.md)
  for why this specifically mattered on this machine.

## Consequences

Requires Docker to be running for local development; see
[operations/local-development.md](../operations/local-development.md).

## Revisit when

Development needs additional services (e.g. Redis, worker), integration
tests, or a remote/staging database. Keep per-project ownership.
