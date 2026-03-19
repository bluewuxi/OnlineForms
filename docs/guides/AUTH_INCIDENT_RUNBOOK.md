# OnlineForms Auth Incident Runbook

## Scope

Use this runbook for production auth incidents: invalid token spikes, tenant mismatch denials, role denied spikes, or suspected membership table drift.

## Signals

CloudWatch alarms (5-minute window):

- `AuthInvalidTokenAlarm`
- `AuthTenantMismatchAlarm`
- `AuthRoleDeniedAlarm`

Auth metric namespace:

- `OnlineForms/Auth`

Key metrics:

- `InvalidTokenCount`
- `TenantMismatchCount`
- `RoleDeniedCount`
- `MembershipDeniedCount`

## Triage Steps

1. Confirm which auth alarm fired and in which environment/stack.
2. Open recent Lambda logs and filter for `\"type\":\"auth_audit\"`.
3. Group by auth audit event:
   - `auth_invalid_token`
   - `auth_tenant_mismatch`
   - `auth_role_denied`
   - `auth_membership_denied`
4. Identify dominant route and tenant impact from surrounding request logs.
5. Validate Cognito config in runtime:
   - `AUTH_MODE`
   - `COGNITO_USER_POOL_ID`
   - `COGNITO_CLIENT_ID`
   - `COGNITO_TOKEN_USE`
6. For membership-related denials, inspect `OnlineFormsAuth` records:
   - `PK=USER#{sub}`, `SK=MEMBERSHIP#{tenantId}`
   - verify `status=active`, expected `role`, and timestamps.
7. Confirm no recent policy/config deploy changed auth behavior unexpectedly.

## Typical Root Causes

- Expired/invalid bearer tokens from client refresh bug.
- Wrong tenant context header (`x-tenant-id`) in frontend requests.
- Role regression in Cognito claims/groups mapping.
- Missing or stale membership rows in `OnlineFormsAuth`.
- Misconfigured Cognito env vars after deployment.

## Mitigation Actions

- Roll back recent auth/config deployment if regression started immediately after release.
- Patch client token refresh or tenant-header resolution when request-side issue is confirmed.
- Backfill/fix membership rows for affected users in `OnlineFormsAuth`.
- Correct Cognito claim mapping and redeploy auth configuration.

## Exit Criteria

- Auth alarms return to normal and remain stable for at least 30 minutes.
- No new high-severity auth incidents observed in logs.
- Incident summary posted with root cause and preventive follow-up tasks.
