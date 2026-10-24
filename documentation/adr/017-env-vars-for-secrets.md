# ADR-017: Secrets and configuration belong in environment variables

**Status:** Accepted

## Context

`DATABASE_URL`, AWS credentials, region, and bucket name must not be
hardcoded or committed to the repository.

## Decision

Keep all secrets and environment-specific configuration in local
environment configuration (`.env`, gitignored), never hardcoded in source.

## Rationale

- Credentials must not be exposed in the repository or logs.
- Configuration varies between local, test, staging, and production environments.
- Debugging should confirm whether a secret exists, not print the secret.

## Alternatives considered

- **Hardcode access keys, database credentials, region, or bucket name in
  application code.** Rejected.

## Consequences

Required environment variable names (not values) should be documented in
[operations/aws-and-s3.md](../operations/aws-and-s3.md) and
[operations/local-development.md](../operations/local-development.md) so a
new contributor knows what to set without seeing real secrets.

## Revisit when

Moving to deployment: use the platform's secret manager and rotate any
long-lived credentials that have been exposed or are no longer needed.
