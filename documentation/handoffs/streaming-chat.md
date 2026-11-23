# Stream chat answers with cancellation and latency metrics

## Proposed pull request

Head branch: `feature/streaming-chat`

Base branch: `working`

Chat answers now appear incrementally, with Searching/Answering states and a
Stop control. Interrupted output remains visible and is explicitly incomplete.
The API opts into SSE through `Accept: text/event-stream`; existing JSON callers
retain their response contract. Both paths use the existing model, retrieval,
grounding instructions, and citation format.

Request/model spans cover the stream lifetime, record first-text latency and
available token usage, and distinguish success, failure, and cancellation.
Browser measurements are separate numeric console events. Safe diagnostics
continue to exclude prompts, answers, document contents, and raw exceptions.

## Validation

- `npm run test:coverage`: 66 tests passed, including fragmented UTF-8/SSE,
  actual route-to-client-parser integration, cancellation, incomplete output,
  and existing JSON callers.
- `npm run lint`, `npx tsc --noEmit`, and `git diff --check`: passed.
- Production build passed with app credentials empty and AWS_REGION set to a
  nonsecret CI placeholder. Network access was needed for existing Google Fonts.
- User manually confirmed incremental display. One successful live request
  completed in 6.05 seconds, with server first text available around 2.56 seconds
  after request start. This is not a p50/p95 baseline or evidence of a total
  runtime improvement caused by streaming.
- Automated rendered interaction checks were unavailable due browser control
  failures. Manual Stop/retry and navigation cancellation still need checking.

## Compatibility and operational notes

No schema migration, new dependency, model change, or new environment variable.
Keep the existing runtime OpenAI/database configuration. Stop aborts generation;
embedding/database work already running during retrieval may finish. Server
completion measures stream production, not delivery of every byte to the client.
Any future reverse proxy must preserve streaming and propagate disconnects;
verify deployed incremental delivery rather than assuming local behavior holds.

Rollback: make the browser request JSON again; the JSON API remains available.
No EC2 deployment, tool interface, routing system, or worktree migration is part
of this change. Uploaded PDFs must remain outside this commit.

## Review order

1. Telemetry lifetime and usage fields.
2. Optional SSE route and JSON compatibility.
3. Browser event parsing, partial-answer handling, and cancellation.

## Branch and worktree workflow

This feature branches from `working` so its review contains only streaming work.
Do not target `main` for this focused PR: it lacks earlier retrieval/timing fixes,
and its history also predates commit-message cleanup. Review and integrate
`working` into `main` as a separate deliberate change.

This session uses the existing checkout; no extra worktree was created. For the
next independent feature, create a branch in a separate worktree from the chosen
integration base before editing. Give agents distinct ownership, agree shared
interfaces before parallel edits, run combined checks after integration, and
keep commits/pushes/merges/deployments as explicit actions.

Future EC2 work should be a separate change with runtime secrets, persistent
storage, process management, streaming proxy behavior, health checks, and a
rollback procedure reviewed before deployment. A callable tool API needs a
separate contract and access boundary; it is not established by this handoff.
