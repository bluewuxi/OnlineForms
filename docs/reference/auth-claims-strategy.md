# OnlineForms Auth Claim Strategy (Phase 4)

## Goal

Keep JWT claims minimal and stable for multi-tenant SaaS while tenant membership and role enforcement is resolved from `OnlineFormsAuth`.

## Stable Claim Set

Use only these custom claims as the long-term contract:

- `custom:defaultTenantId`
- `custom:platformRole`

Backward-compatible fallbacks still supported during migration:

- tenant: `custom:tenantId`, `tenantId`
- role: `custom:role`, `role`, first `cognito:groups` entry

## Why This Avoids Claim Explosion

- JWTs do not carry per-tenant memberships.
- Tenant membership list stays in DynamoDB (`OnlineFormsAuth`) and is checked at request time.
- JWT remains compact and stable as a user is added to more tenants.

## Authorization Decision Path

For protected org endpoints:

1. Verify Cognito JWT (`sub`, token use, issuer/audience).
2. Resolve active tenant in order:
   - `x-tenant-id` header
   - route tenant context
   - default tenant claim (`custom:defaultTenantId` fallback chain)
3. Resolve caller role (`custom:platformRole` fallback chain).
4. Apply endpoint authorization policy.
5. For non-platform callers, require active membership in `OnlineFormsAuth`:
   - `PK=USER#{sub}`
   - `SK=MEMBERSHIP#{tenantId}`
6. Execute tenant-scoped business operation.

## Platform Admin Guardrail

- `platform_admin` bypass is allowed only on approved endpoints.
- No blanket tenant bypass.
