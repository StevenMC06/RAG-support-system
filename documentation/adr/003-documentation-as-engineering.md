# ADR-003: Treat documentation as part of engineering

**Status:** Accepted

## Context

Important decisions in this project were initially only present in chat
conversation with an AI assistant, not in the repository. That knowledge is
easy to lose and impossible for a future collaborator (including
future-you) to recover from the code alone.

## Decision

Record every meaningful technical choice as an ADR with: what we decided,
why, what alternatives we rejected or deferred, and what would cause us to
revisit it. Use [template.md](template.md) for new ADRs.

## Rationale

- Future-you and collaborators need the reasoning, not just the final code.
- Documentation makes trade-offs visible and reduces re-litigating settled issues.

## Alternatives considered

- **Rely on commit messages and memory alone.** Rejected — this is exactly
  what already failed once for this project (see
  [documentation/archive/](../archive/) for the original, pre-restructure
  decision log written to recover that lost context).

## Consequences

Every non-trivial decision now costs a short write-up. In exchange, the
`documentation/` folder becomes the durable record instead of chat history.

## Required ADR questions

1. What did we decide?
2. Why did we decide it?
3. What alternatives did we reject or defer?
4. What changes would cause us to revisit it?

## Revisit when

Always. This is a process decision; improve the template as the project
matures.
