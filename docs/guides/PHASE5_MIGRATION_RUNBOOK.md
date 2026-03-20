# Phase 5 Migration Runbook

This runbook covers tenant-profile enrichment backfill and validation for Phase 5.

## Scope

- Backfill tenant profile fields:
  - `description`
  - `isActive`
  - `homePageContent`
- Normalize legacy `status` into `active` or `inactive`
- Verify new public/internal endpoints:
  - `GET /v1/public/tenants`
  - `GET /v1/public/{tenantCode}/tenant-home`
  - `GET /v1/public/auth-options`
  - `GET /v1/internal/tenants`
  - `PATCH /v1/internal/tenants/{tenantId}`

## Prerequisites

- AWS credentials with DynamoDB read/write permissions on `OnlineFormsMain`
- Target table exported in env:
  - `ONLINEFORMS_TABLE=OnlineFormsMain`
- Backend deployed with Phase 5 handlers

## Migration Commands

1. Dry run (default):

```bash
npm run migrate:tenant-profiles
```

2. Apply changes:

```bash
MIGRATION_DRY_RUN=false npm run migrate:tenant-profiles
```

## Validation

1. Run automated tests:

```bash
npm test
```

2. Run smoke requests:

- Use `smoke/phase5-smoke.http`
- Confirm `public/tenants` and `public/{tenantCode}/tenant-home` return 200 for active tenant
- Confirm `public/auth-options` includes `internal_admin` with `requiresTenant=false`
- Confirm internal tenant update endpoint works for `internal_admin`

## Rollback

- Migration is additive/normalizing only.
- To rollback data shape:
  - re-run tenant profile update script with desired values using `PATCH /v1/internal/tenants/{tenantId}`
  - or use DynamoDB point-in-time recovery if full rollback is required.
