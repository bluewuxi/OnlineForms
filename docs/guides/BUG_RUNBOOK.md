# Bug Investigation Runbook

## Purpose

Provide a fast, repeatable workflow to investigate and verify bug fixes.

## 1) Capture Context

- Issue ID and severity
- Environment and deployment version/commit
- Exact endpoint/page and timestamp
- Request ID and correlation ID when available

## 2) Reproduce

- Reproduce in lowest possible environment first (`local` -> `stage` -> `prod`).
- Capture exact reproduction steps and sample payloads.
- Confirm expected vs actual behavior.

## 3) Localize Root Cause

- Determine failure domain:
  - frontend state/routing/session
  - backend auth/authorization/validation/business logic
  - data consistency
  - infra or deployment configuration
- Use logs and metrics first, then code traces.

## 4) Fix Safely

- Implement the smallest safe change.
- Add/update tests that fail before and pass after.
- Ensure no cross-tenant/security regression.

## 5) Validate

- Run lint/tests/build as applicable.
- Verify target workflow in `stage`.
- Check related flows to avoid regressions.

## 6) Closeout

- Update issue with:
  - root cause
  - fix summary
  - validation evidence
  - rollback plan (if needed)
- Close issue after verification.

## Common Signals

- `401 UNAUTHORIZED`: token missing/invalid/expired or token-use mismatch.
- `403 FORBIDDEN`: role denied, tenant mismatch, membership missing/inactive.
- `5xx`: deployment/config/runtime error.
