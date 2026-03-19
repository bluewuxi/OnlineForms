# OnlineForms MVP User Guide

Last updated: 2026-03-19

## 1) Environment

- Region: `ap-southeast-2`
- API base URL: `https://5n7ng70uw5.execute-api.ap-southeast-2.amazonaws.com/v1`

## 2) Portal URLs

Note: MVP currently exposes API endpoints (no separate browser UI portal deployed yet).

Public portal-style endpoints:

- Public course catalog:
  - `https://5n7ng70uw5.execute-api.ap-southeast-2.amazonaws.com/v1/public/std-school/courses`
- Public course detail:
  - `https://5n7ng70uw5.execute-api.ap-southeast-2.amazonaws.com/v1/public/std-school/courses/std_001`

Org portal-style endpoints (API):

- Org profile:
  - `https://5n7ng70uw5.execute-api.ap-southeast-2.amazonaws.com/v1/org/me`
- Org submissions:
  - `https://5n7ng70uw5.execute-api.ap-southeast-2.amazonaws.com/v1/org/submissions`
- Org audit log:
  - `https://5n7ng70uw5.execute-api.ap-southeast-2.amazonaws.com/v1/org/audit`

Health check:

- `https://5n7ng70uw5.execute-api.ap-southeast-2.amazonaws.com/v1/health`

## 3) Authentication Modes

### Preferred (stage/prod): Cognito JWT

Use bearer token for org endpoints:

- `Authorization: Bearer <jwt>`

Optional active tenant selection:

- `x-tenant-id: <tenantId>`

Tenant context resolution order:

1. `x-tenant-id`
2. route tenant context
3. JWT default tenant claim

### Local/test only: mock mode

Mock headers:

- `x-user-id: user_1`
- `x-tenant-id: 001`
- `x-role: org_admin` (or `org_editor`)

## 4) Seeded Test Data

Seed command:

- `npm run seed:sample`

Default seeded values:

- `tenantId: 001`
- `tenantCode: std-school`
- `courseId: std_001`
- `formId: frm_001`
- `formVersion: 1`

## 5) Quick API Examples

Get org profile (mock mode):

```bash
curl -H "x-user-id: user_1" ^
     -H "x-tenant-id: 001" ^
     -H "x-role: org_admin" ^
     https://5n7ng70uw5.execute-api.ap-southeast-2.amazonaws.com/v1/org/me
```

Get org profile (Cognito mode):

```bash
curl -H "Authorization: Bearer <jwt>" \
     -H "x-tenant-id: 001" \
     https://5n7ng70uw5.execute-api.ap-southeast-2.amazonaws.com/v1/org/me
```

List public courses:

```bash
curl https://5n7ng70uw5.execute-api.ap-southeast-2.amazonaws.com/v1/public/std-school/courses
```

Submit enrollment:

```bash
curl -X POST \
  -H "content-type: application/json" \
  -H "idempotency-key: 3c579f90-4962-4a49-9ced-e6a37f63500a" \
  -d "{\"formVersion\":1,\"answers\":{\"first_name\":\"Alice\",\"email\":\"alice@example.com\",\"consent_terms\":true}}" \
  https://5n7ng70uw5.execute-api.ap-southeast-2.amazonaws.com/v1/public/std-school/courses/std_001/enrollments
```
