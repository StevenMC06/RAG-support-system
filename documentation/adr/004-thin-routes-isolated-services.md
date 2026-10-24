# ADR-004: Keep route handlers thin; isolate external services in `lib/`

**Status:** Accepted

## Context

Route handlers can easily accumulate AWS SDK calls, file transformations,
and database logic directly inline, which makes them hard to read and
impossible to change one integration at a time.

## Decision

Route handlers own HTTP concerns (receive request → validate → call
services → return response). External integrations and reusable
implementation details live behind focused modules: `lib/s3.ts`,
`lib/prisma.ts`, `lib/embeddings.ts`, `lib/chunkTest.ts`.

```text
route.ts:   receive request → validate → call services → return response
lib/s3.ts:  convert bytes → call AWS → return S3 key
```

## Rationale

- Routes stay readable and follow the business flow in English.
- AWS, database, PDF, and embedding code can be changed and tested independently.
- Switching storage providers or adding delete operations affects one
  integration boundary instead of every route.

## Alternatives considered

- **Put AWS SDK calls, file transformations, local writes, and database
  logic directly in `app/api/upload/route.ts`.** Rejected — couples HTTP
  concerns to implementation details.

## Consequences

An extra module boundary to maintain for every new integration.

**Correction from project history:** `lib/prisma.ts` was initially
referenced before it had actually been created. Do not assume an importable
helper exists — verify the file and its exports before telling someone to
import it. A Prisma schema/configuration existing outside `lib/` is not a
substitute for a `lib/prisma.ts` client module. (As of this writing,
`lib/prisma.ts` exists and is imported by both `app/api/upload/route.ts` and
`app/api/extract/route.ts`.)

## Revisit when

The application gains multiple domains or needs a formal service/repository
layer. Keep the same responsibility boundaries even if the folder structure
changes.
