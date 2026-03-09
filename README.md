# OnlineForms

Backend scaffold for Phase 1 of OnlineForms MVP.

## Structure

- `infra/` deployment baseline (AWS SAM template)
- `services/` Lambda handlers and API code
- `shared/` shared utilities (correlation, guards, contracts)

## Implemented in P1-01

- Health endpoint: `GET /v1/health`
- Correlation ID handling:
  - Accepts incoming `x-correlation-id`
  - Falls back to API Gateway request ID
  - Returns `x-correlation-id` response header

## Implemented in P1-02

- Cognito JWT authentication middleware for org endpoints
- Auth context extraction:
  - `userId` from `sub`
  - `tenantId` from `custom:tenantId` (fallback `tenantId`)
  - `role` from `custom:role` (fallback `role` / first `cognito:groups`)
- Tenant guard helper with cross-tenant `403` enforcement
- Protected endpoints:
  - `GET /v1/org/me`
  - `GET /v1/org/tenants/{tenantId}/check`

Auth modes:

- `AUTH_MODE=cognito` (default): verifies Cognito JWT
- `AUTH_MODE=mock`: local-only mock headers (`x-user-id`, `x-tenant-id`, `x-role`)

## Local Dev

```bash
npm install
npm run typecheck
npm run build
```

## Deploy Baseline (SAM)

```bash
sam build -t infra/template.yaml
sam deploy --guided -t infra/template.yaml
```
