# ADR-002: Build infrastructure and ingestion before retrieval/chat

**Status:** Accepted

## Context

It would be possible to jump straight to an embeddings call or a chat
endpoint for a quick demo, but that risks building on a document lifecycle
that isn't actually dependable.

## Decision

Finish the ingestion path in sequence: upload → storage → metadata →
extraction → chunking → embeddings → vector search → chat. See
[system-overview.md](../architecture/system-overview.md) for current status
against this sequence.

## Rationale

- A chat feature cannot be reliable without trustworthy document ingestion and retrieval.
- Each stage produces an inspectable artifact for debugging.
- Avoids partially built subsystems and unclear failures.

## Alternatives considered

- **Jump directly to embeddings, a model call, or chat** before the document
  lifecycle is dependable. Rejected — failures would be unattributable to a
  specific stage.

## Consequences

Slower path to a demoable "chat with your PDF" feature. In exchange, each
stage (see [status.md](../status.md)) can be verified independently before
the next is built on top of it.

## Revisit when

The system needs asynchronous/background processing, queues, or parallel
teams working on clearly defined interfaces.
