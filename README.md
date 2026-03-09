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

- `AUTH_MODE=mock` (default in SAM template for dev): uses mock headers
- `AUTH_MODE=cognito`: verifies Cognito JWT using configured user pool/client

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

## P1-03 Course Endpoints

Protected org routes:

- `POST /v1/org/courses`
- `GET /v1/org/courses`
- `GET /v1/org/courses/{courseId}`
- `PATCH /v1/org/courses/{courseId}`
- `POST /v1/org/courses/{courseId}/publish`
- `POST /v1/org/courses/{courseId}/archive`
- `PUT /v1/org/courses/{courseId}/form-schema`
- `GET /v1/org/courses/{courseId}/form-schema`
- `GET /v1/org/courses/{courseId}/form-schema/versions/{version}`

When running in `AUTH_MODE=mock`, include headers:

- `x-user-id: user_1`
- `x-tenant-id: ten_001`
- `x-role: org_admin`
