# Phase 6 Cognito Refresh Runbook

Last updated: 2026-03-20

## Goal

Define Cognito app-client and deployment prerequisites for frontend refresh-token sessions with backend JWT verification.

## Required Cognito App Client Settings

- App client must support refresh flow:
  - `ALLOW_REFRESH_TOKEN_AUTH`
- Keep user sign-in flow enabled:
  - `ALLOW_USER_SRP_AUTH` (or Hosted UI equivalent)
- Suggested token-use for backend auth verification:
  - `COGNITO_TOKEN_USE=access`

## Recommended Token Validity

- Access token: 60 minutes
- ID token: 60 minutes
- Refresh token: 30 days

Notes:

- Access/ID token validity should stay short to reduce impact window.
- Refresh token validity should match security posture and expected session persistence.

## Backend Deployment Prerequisites

GitHub repository variables required by deploy workflow:

- `AWS_REGION`
- `STACK_NAME`
- `DEPLOYMENT_ENVIRONMENT` (`local|test|stage|prod`)
- `COGNITO_TOKEN_USE` (`access|id`)

Deploy workflow behavior:

- if `DEPLOYMENT_ENVIRONMENT` is empty or `true`, workflow normalizes to `stage`
- if `COGNITO_TOKEN_USE` is empty, workflow normalizes to `access`
- workflow fails fast for invalid values

## Validation Checklist (Pre-Release)

1. Confirm stack outputs include Cognito user pool and app-client IDs.
2. Verify frontend can obtain access/id/refresh tokens for test account.
3. Call `/v1/org/me` with access token in `Authorization` header and expect `200`.
4. Wait for access token expiry and verify refreshed token restores `200`.
5. Revoke/expire refresh token and verify client is forced back to login.

## Rollback Notes

- If refresh rollout causes auth failures:
  - temporarily switch client behavior to full re-login on 401
  - keep backend verification unchanged
  - verify `COGNITO_TOKEN_USE` matches issued token type
