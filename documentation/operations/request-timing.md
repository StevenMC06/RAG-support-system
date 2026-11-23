# Request and call timing

Last verified against repository: 2026-11-22 (source and automated tests).

`POST /api/search` and `POST /api/chat` generate a fresh UUID request ID,
returned in `X-Request-ID` on success, validation errors, and handled failures.
Response bodies are unchanged. Incoming request IDs are not trusted or reused.

Each completed operation writes one JSON line to standard output via
`console.info`. Filter on `requestId` to reconstruct a request. `callId` is a
unique invocation ID; `parentId` identifies the enclosing operation's call ID.
IDs are generated before invoking the operation. Model names identify models;
call IDs identify invocations. They are not provider-assigned IDs.

Operations currently include request handling, retrieval, embedding generation,
database retrieval, and answer generation. Model events include `provider` and
`model`; successful provider request/response IDs are included when available.
Embedding calls outside search/chat also emit events, but have an independent
request ID when no trace context is supplied.

Events include UTC `startedAt`/`endedAt`, monotonic `durationMs`, and a
success/failure outcome. Request events include `httpStatus`; HTTP 4xx/5xx are
failures. Nested durations overlap and must not be summed. Model timings cover
the SDK call, including any SDK retries, not individual HTTP attempts. Request
time ends when the server constructs the response, not when the client receives
it. Streaming and client round-trip metrics are not implemented.

`lib/telemetry.ts` exposes `timeOperation` for future tools:

```ts
await timeOperation(trace, {
  kind: "tool",
  name: "catalog.lookup",
  toolName: "catalog",
}, async (toolTrace) => {
  // Execute the tool here; pass toolTrace to any nested operations.
});
```

Logging is best effort. It never serializes inputs, outputs, raw exceptions,
prompts, document text, or tool arguments. Keep operation names/model/tool
metadata developer-controlled. Existing upload/extract logging is outside this
feature and must be reviewed before processing sensitive data.

No external telemetry service is configured. Logs currently follow the host's
stdout retention. Langfuse Cloud export is a separate proposed feature.

Verification: `npm run test:coverage`, `npm run lint`, `npx tsc --noEmit`, and
`npm run build`. Tests use mocked model/database calls; they do not establish
live retrieval relevance or real provider latency.
