# Cognito Auth Troubleshooting (Phase 4)

## Required Runtime Config

- `AUTH_MODE=cognito`
- `COGNITO_USER_POOL_ID`
- `COGNITO_CLIENT_ID`
- `COGNITO_TOKEN_USE` (`access` or `id`)
- `ONLINEFORMS_AUTH_TABLE`

## Common Symptoms

## 401 `UNAUTHORIZED`

Likely causes:

- missing/invalid bearer token
- expired JWT
- wrong user pool/client/token use

Checks:

1. confirm `Authorization: Bearer <jwt>` format
2. decode JWT and verify `exp`, `iss`, `aud` / `client_id`
3. verify runtime env values match Cognito pool/client

## 403 `FORBIDDEN` with tenant-related message

Likely causes:

- wrong `x-tenant-id`
- user missing active membership in `OnlineFormsAuth`
- cross-tenant request blocked

Checks:

1. confirm tenant resolution input (`x-tenant-id` or route tenant)
2. check membership record:
   - `PK=USER#{sub}`
   - `SK=MEMBERSHIP#{tenantId}`
3. verify `status=active`

## 403 `FORBIDDEN` role denied

Likely causes:

- role claim not in allowed set
- endpoint policy does not allow caller role
- platform admin attempted non-approved bypass endpoint

Checks:

1. inspect claims precedence:
   - `custom:platformRole` -> `custom:role` -> `role` -> first `cognito:groups`
2. verify endpoint policy in `services/api/src/lib/authorization.ts`

## Observability Signals

- Metrics namespace: `OnlineForms/Auth`
- Metrics:
  - `InvalidTokenCount`
  - `TenantMismatchCount`
  - `RoleDeniedCount`
  - `MembershipDeniedCount`
- Structured log marker: `\"type\":\"auth_audit\"`
