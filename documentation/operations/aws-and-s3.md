# AWS and S3

**Last verified against repository:** 2026-09-01 (`lib/s3.ts` read directly)

## Purpose

S3 stores original PDF bytes; PostgreSQL stores everything else
(metadata, chunks, embeddings). See
[ADR-007](../adr/007-s3-for-files-postgres-for-metadata.md).

## Object key strategy

Implementation: `uploadedToS3` in `lib/s3.ts`.

```ts
const extension = file.name.split(".").pop() ?? "pdf";
const key = `${randomUUID()}.${extension}`;
```

- Keys are UUID-based, not derived from the original filename, so two
  uploads with the same name never collide or overwrite each other. See
  [ADR-009](../adr/009-unique-prefixed-s3-keys.md).
- The original filename is kept separately as `Document.filename`
  metadata, not used as the storage identifier.
- **Note:** the key currently has no folder prefix (e.g. no `documents/`
  segment) — just `<uuid>.<ext>` directly in the bucket root. If a
  prefixed layout is wanted later (for lifecycle rules or organization),
  it's a small, isolated change to this one function.

## Required environment variables

- `AWS_REGION` — should be a single, consistent region across the project
  (`us-west-2` was the region selected when this was set up).
- `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` — a **dedicated IAM
  identity**, not AWS root credentials. See
  [ADR-016](../adr/016-iam-least-privilege-private-s3.md).
- `AWS_BUCKET_NAME` — the bucket used for PDF storage.

Never hardcode these values or commit them; see
[ADR-017](../adr/017-env-vars-for-secrets.md).

## IAM policy: known technical debt

The IAM identity currently uses the broad, AWS-managed
`AmazonS3FullAccess` policy. This was accepted temporarily to unblock the
first working integration and **has not yet been replaced**. Before this
project is treated as production-oriented, replace it with a custom,
bucket-scoped policy granting only:

- `s3:PutObject` / `s3:GetObject` on the specific bucket (required today).
- `s3:DeleteObject`, only if/when the
  [ADR-008](../adr/008-s3-upload-before-db-row.md) orphaned-object
  compensation logic is implemented.

See [ADR-016](../adr/016-iam-least-privilege-private-s3.md) and
[status.md](../status.md) for this as tracked open work.

## Bucket posture

- Public access blocked.
- ACLs disabled (bucket-owner-enforced).
- Server-side encryption enabled.
- Budget/billing alerts configured, since this is a personal learning
  project and unexpected spend should be caught early.

## Credential safety rules

- Never print secret values in logs, even for debugging — confirm
  presence (`process.env.AWS_ACCESS_KEY_ID ? "set" : "missing"`), not
  content.
- Before deploying anywhere beyond local development, move to the
  platform's secret manager and prefer short-lived roles/workload identity
  over long-lived access keys where the platform supports it.
