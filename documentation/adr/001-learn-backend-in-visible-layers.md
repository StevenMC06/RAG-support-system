# ADR-001: Learn the backend in visible layers

**Status:** Accepted

## Context

This project exists to learn production backend and RAG-system fundamentals,
not just to produce a working demo quickly. AI assistance is available for
syntax and implementation, but it must not silently invent files,
configuration, or architectural steps that haven't actually been built.

## Decision

Build and understand route handlers, `FormData`, validation, Docker,
PostgreSQL, Prisma, S3, and the ingestion pipeline explicitly before leaning
on high-level AI/RAG abstractions.

## Rationale

- The learning goal is transferable system understanding, not only a working output.
- Clear boundaries make debugging possible when real failures occur.
- AI can accelerate implementation once the architecture is understood.

## Alternatives considered

- **Let an agent scaffold the entire backend and RAG pipeline** without
  walking through ownership, data flow, or operational behavior. Rejected —
  it would produce a working system without the understanding this project
  is for.

## Consequences

Development is slower than a pure scaffold-and-ship approach. Every stage
(upload, storage, extraction, chunking, embeddings, retrieval) is built and
inspected in order rather than generated wholesale.

## Revisit when

The fundamentals are comfortable and speed matters more than learning a
particular implementation detail. Continue to preserve architectural review
even when using generators.
