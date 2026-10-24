# ADR-016: IAM authentication, least privilege, and private S3

**Status:** Accepted, with known technical debt (see Consequences)

## Context

The backend needs AWS credentials to read/write S3. Using root account
credentials, public buckets, or unlimited permissions would be inappropriate
even for a learning project.

## Decision

Use a dedicated IAM identity for the backend rather than AWS root
credentials. Keep S3 public access blocked, ACLs disabled, and server-side
encryption enabled. Use a consistent region (`us-west-2`) and establish
billing/budget alerts.

## Rationale

- IAM separates authentication (access key/secret) from authorization (policy).
- Root credentials are too powerful for application use.
- Private PDFs should be accessed by the backend, not the public internet.
- Budget alerts protect a learning project from unexpected spend.

## Alternatives considered

- **Use AWS root credentials directly**, or **leave the bucket publicly
  accessible.** Both rejected.

## Consequences

**Temporary concession, still outstanding:** `AmazonS3FullAccess` was
accepted to unblock the first learning integration. This is broader than
necessary and should be replaced with a custom, bucket-scoped policy
granting only the required object actions (currently upload/read; delete
only if the [ADR-008](008-s3-upload-before-db-row.md) compensation cleanup
is implemented). Tracked as open work in [status.md](../status.md).

## Revisit when

Before production, when adding deployment credentials, presigned URLs,
multiple environments, or a background worker. Prefer roles/workload
identity over long-lived access keys in deployed environments.
