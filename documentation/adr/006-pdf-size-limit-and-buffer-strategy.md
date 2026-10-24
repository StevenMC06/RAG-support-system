# ADR-006: Limit PDFs to 10 MB and use `arrayBuffer()`

**Status:** Accepted

## Context

The upload path needs to move bytes from a Web API `File` to the AWS SDK,
which expects a Node `Buffer`. Streaming is more memory-efficient but adds
complexity.

## Decision

Accept PDFs up to 10 MB (`MAX_FILE_SIZE = 10 * 1024 * 1024` in
`app/api/upload/route.ts`) and use `await file.arrayBuffer()` followed by
`Buffer.from(...)`.

```text
File → ArrayBuffer → Node Buffer → AWS SDK → S3
```

## Rationale

- At 10 MB, reading the file into memory is a simple, acceptable trade-off.
- The `File` is a Web API value; the Node/AWS layer accepts a Node `Buffer` comfortably.
- Simplicity supports the learning goal without premature optimization.

## Alternatives considered

- **Use `file.stream()` immediately.** Rejected for now — more
  memory-efficient, but adds complexity this requirement doesn't need yet.

## Consequences

Memory usage scales with concurrent upload size; acceptable at 10 MB and
current expected traffic.

## Revisit when

Upload limits rise materially, concurrent traffic makes memory pressure
meaningful, or the application accepts large manuals, media, or other large
assets.
