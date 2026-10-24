# ADR-013: Let Docker Compose manage names and persistent data

**Status:** Accepted — see note on current deviation

## Context

Docker container names and Compose project grouping can be overridden
manually, but doing so is a cosmetic choice that doesn't affect behavior
and can create collisions.

## Decision

Prefer Compose-managed container names and project grouping; avoid
unnecessary `container_name` overrides. Treat volumes as data-bearing
assets and containers as replaceable runtime instances.

## Rationale

- Compose's project/service names stay clean in Docker Desktop and avoid collisions.
- `docker compose down` removes containers and networks but preserves named volumes by default.
- The distinction avoids accidental data loss: deleting a container is not the same as deleting its volume.

## Alternatives considered

- **Manually manage Docker Desktop items or use forced global container
  names for cosmetic organization.** Rejected as the default.

## Consequences

**Current deviation:** `compose.yaml` sets `container_name: rag-postgres`
explicitly. This isn't necessarily wrong (a stable, recognizable name for a
single-service project has some value) but it is a deviation from this
ADR's stated preference. Tracked in [status.md](../status.md) as an open
question rather than silently ignored.

## Revisit when

An external integration specifically requires a fixed container name — or,
given the current deviation, decide explicitly whether to keep
`container_name` and update this ADR's status to reflect that decision.
