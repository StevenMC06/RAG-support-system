# ADR-018: Maintain a practical documentation structure

**Status:** Accepted (this ADR describes the structure this file lives in)

## Context

Documentation for this project originally accumulated as long, monolithic
files (`rag-support-system-architecture-decisions.md`,
`RAG_BACKEND_HANDOFF.md`) that mixed immutable decisions with fast-changing
status. That made it hard to update one without touching the other, and
hard for a reader to find a specific past decision.

## Decision

Maintain repository documentation under `documentation/`, split by how
often each kind of content changes:

```text
documentation/
  README.md              — index and workflow
  adr/                    — numbered, (mostly) immutable decision records
  architecture/           — how the system works today, updated as it changes
  operations/             — how to run/operate it locally and in AWS
  status.md               — fast-moving: current milestone, blockers, checklist
  archive/                — superseded monolithic docs, kept verbatim for history
```

## Rationale

Documentation should form the project's memory: it explains what exists,
why it exists, and how to safely operate or change it. Separating
"decision" (rarely changes) from "current state" (changes often) means
updating status doesn't require rewriting rationale, and vice versa.

## Alternatives considered

- **Keep growing the two original monolithic files.** Rejected — the files
  had already grown to mix immutable rationale with a living
  status/handoff, making both harder to maintain. They're preserved as-is
  in [archive/](../archive/) rather than deleted, per this ADR's own rule
  against rewriting history.
- **One ADR per broad theme** (e.g. a single `002-storage-strategy.md`
  covering S3 + Postgres + key naming together). Considered, but the
  project already had 18 independently-titled decisions with distinct
  rationale; splitting one-per-decision keeps each ADR small and lets a
  single decision be superseded without touching unrelated ones.

## Consequences

More files to navigate, but each one is small and single-purpose. New
decisions should be added as a new numbered file in `adr/`, not appended to
an existing one.

## Revisit when

Documentation becomes repetitive. Consolidate stable reference material,
but retain ADRs as immutable historical decisions with superseding ADRs
rather than rewriting history.
