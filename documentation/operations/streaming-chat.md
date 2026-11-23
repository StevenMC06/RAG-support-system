# Streaming chat

## Contract

`POST /api/chat` keeps its existing JSON response unless a caller explicitly
requests `Accept: text/event-stream`. Validation and retrieval errors before
stream startup retain HTTP error responses. Streaming responses use
`Content-Type: text/event-stream`, and `X-Request-ID` links them to server logs.

The browser-safe TypeScript contract lives in `lib/chat-events.ts`. Each SSE
frame has an `event` field and a JSON `data` field with a matching `type`:

- `sources`: retrieved citation metadata; these are candidates, not a claim that
  every source supports every sentence.
- `delta`: an incremental answer text fragment.
- `done`: successful completion.
- `error`: a safe message indicating the answer is incomplete.

Only `done` means a complete answer. EOF, provider truncation/filtering, and
provider errors must not silently mark partial answers as successful. Once
headers have been sent, a provider failure is represented by an error event,
not by changing HTTP status. Cancelled streams may close without an event.

## Browser behavior

The page searches first, displays answer fragments as they arrive, and offers
Stop during an active request. Errors or cancellation retain any partial text
with an incomplete label. Starting another request clears the previous answer.
Leaving the page aborts the active request. JSON responses are still handled.
Stop aborts active answer generation and prevents generation from starting after
a cancelled retrieval. Embedding/database work already running during retrieval
is not yet interruptible and can finish after the request is cancelled.

## Measurements

`firstTextMs` on a model span measures time from SDK invocation to the first
nonempty text delta. The enclosing request span runs through stream production,
not just Response construction. Server completion means the response stream
has finished production; client/network drain time is measured separately.
Usage fields are `inputTokens`, `outputTokens`, and `cachedInputTokens` when the
provider reports them. Missing usage, including on interrupted streams, is not
reported as zero. Cancellation uses the `cancelled` outcome.

Browser timing events associate `requestId` with first displayed answer text
and end-to-end completion. They contain numeric timing metadata and outcome,
not questions, document excerpts, or answers. Browser timing currently goes to
the developer console; it is not sent to a managed telemetry service.

Streaming reduces the blank wait; it does not promise lower total model
completion time. Nested spans overlap and should not be summed. No model,
retrieval, chunking, or citation policy changes are part of this feature.

## Rollback and verification

Restore the browser's JSON request behavior to disable streaming without a
schema migration. Existing JSON callers remain compatible.

Automated checks cover telemetry lifetimes, fragmented UTF-8/SSE parsing,
terminal events, route compatibility, provider errors, and cancellation. Run
`npm run test:coverage`, `npm run lint`, `npx tsc --noEmit`, and `npm run build`.
Use synthetic delayed streams to verify incremental UI, Stop, incomplete-answer
errors, and retry behavior before using real model calls for latency baselines.
