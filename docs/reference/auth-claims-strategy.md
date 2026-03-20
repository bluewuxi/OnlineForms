# OnlineForms Auth Claim Strategy (Phase 5)

## Goal

Keep JWT claims minimal and stable for single-tenant-per-login SaaS sessions while tenant membership and role enforcement is resolved from `OnlineFormsAuth`.

## Stable Claim Set

Use these custom claims as the contract:

- `custom:tenantId`
- `custom:platformRole`

Backward-compatible role fallbacks remain supported:

- role: `custom:role`, `role`, first `cognito:groups` entry

## Why This Avoids Claim Explosion

- JWTs do not carry membership lists.
- Tenant membership list stays in DynamoDB (`OnlineFormsAuth`) and is checked at request time.
- JWT remains compact and scoped to one tenant per login session.

## Authorization Decision Path

For protected org endpoints:

1. Verify Cognito JWT (`sub`, token use, issuer/audience).
2. Resolve authenticated tenant from JWT claim:
   - `custom:tenantId` (fallback `tenantId`)
3. Reject request if `x-tenant-id` header or route tenant context conflicts with JWT tenant claim.
4. Resolve caller role (`custom:platformRole` fallback chain).
5. Apply endpoint authorization policy.
6. For non-platform callers, require active membership in `OnlineFormsAuth`:
   - `PK=USER#{sub}`
   - `SK=MEMBERSHIP#{tenantId}`
7. Execute tenant-scoped business operation.

## Platform Admin Guardrail

- `platform_admin` bypass is allowed only on approved endpoints.
- No blanket tenant bypass.

## Internal Admin Exception

- `internal_admin` can operate on internal-management routes without tenant context.
- This is enabled only for handlers that explicitly set `allowMissingTenantContext=true`.
