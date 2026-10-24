# ADR-012: One database and one Compose project per application

**Status:** Accepted

## Context

A legacy `stevencarmona` database on this machine mixed Flight Reservation
and Duracell tables together, making ownership and maintenance unclear.

## Decision

Each application receives its own PostgreSQL database and its own Compose
project/infrastructure boundaries.

## Rationale

- Isolation clarifies backup, schema evolution, deletion risk, and service ownership.

## Alternatives considered

- **Put unrelated applications into a single shared database by default.**
  Rejected — this is the exact pattern that caused the ownership confusion
  this ADR is reacting to.

## Consequences

More databases/containers to keep track of, in exchange for clear
ownership boundaries.

## Revisit when

Multiple bounded services intentionally share a database under a
documented ownership model. This should be exceptional, not the starting
point.
