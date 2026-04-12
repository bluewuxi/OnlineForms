# OnlineForms Auth Claim Strategy (Phase 9)

## Goal

Keep JWT claims minimal and stable while supporting dual login intents:
- tenant portal login (tenant + role context selected post-login)
- internal portal login (global internal capability)

## Stable Claim Set

Use these claims as baseline contract:

- `custom:platformRole`

Backward-compatible role fallbacks remain supported:

- role: `custom:role`, `role`, first `cognito:groups` entry

Internal portal capability may come from:

- `custom:platformRole=internal_admin`, or
- `cognito:groups` containing `internal_admin`

Canonical operational mapping:

- CloudFormation parameter: `CognitoInternalGroupName` (default `internal_admin`)
- Runtime env var: `COGNITO_INTERNAL_GROUP_NAME`

## Why This Avoids Claim Explosion

- JWTs do not carry membership lists.
- Tenant memberships and per-tenant roles stay in DynamoDB (`OnlineFormsAuth`).
- Selected tenant context is validated against membership at session-context API step.

## Authorization Decision Path

For tenant portal endpoints:

1. Verify Cognito JWT (`sub`, token use, issuer/audience).
2. Resolve caller role — **`x-role` request header is evaluated first**:
   - If `x-role` is present and is an org role (`org_viewer`, `org_editor`, `org_admin`), it is trusted directly; membership check (step 4) enforces `allowedRoles`.
   - If `x-role` is `platform_support` or `internal_admin`, a matching JWT claim is required (`custom:platformRole` → `custom:role` → `role` → first `cognito:groups` entry).
   - If `x-role` is absent, role is resolved from JWT claims using the same fallback chain.
   - Org users have no role embedded in their JWT — role is selected post-login and carried in `x-role`.
3. Resolve active tenant context (`x-tenant-id` / route hint / `custom:tenantId` claim fallback).
4. Validate selected tenant+role against active membership in `OnlineFormsAuth`:
   - `PK=USER#{sub}`
   - `SK=MEMBERSHIP#{tenantId}`
   - role must be in `allowedRoles` (or legacy `role` fallback)
5. Apply endpoint authorization policy.
6. Execute tenant-scoped business operation.

For internal portal endpoints:

1. Verify Cognito JWT.
2. Require `internal_admin` capability from `x-role` header backed by a JWT claim/group.
3. Do not require tenant membership context for internal-management routes.

## Platform Support Guardrail

- `platform_support` bypass is allowed only on approved endpoints.
- No blanket tenant bypass.

## Internal Admin Exception

- `internal_admin` can operate on internal-management routes without tenant context.
- This is enabled only for handlers that explicitly set `allowMissingTenantContext=true`.
