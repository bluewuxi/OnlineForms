# OnlineForms MVP User Guide

Last updated: 2026-03-10

## 1) Environment

- Region: `ap-southeast-2`
- API base URL: `https://y36enrj145.execute-api.ap-southeast-2.amazonaws.com/v1`

## 2) Portal URLs

Note: MVP currently exposes API endpoints (no separate browser UI portal deployed yet).

Public portal-style endpoints:

- Public course catalog:
  - `https://y36enrj145.execute-api.ap-southeast-2.amazonaws.com/v1/public/demo-school/courses`
- Public course detail:
  - `https://y36enrj145.execute-api.ap-southeast-2.amazonaws.com/v1/public/demo-school/courses/crs_demo_001`

Org portal-style endpoints (API):

- Org profile:
  - `https://y36enrj145.execute-api.ap-southeast-2.amazonaws.com/v1/org/me`
- Org submissions:
  - `https://y36enrj145.execute-api.ap-southeast-2.amazonaws.com/v1/org/submissions`
- Org audit log:
  - `https://y36enrj145.execute-api.ap-southeast-2.amazonaws.com/v1/org/audit`

Health check:

- `https://y36enrj145.execute-api.ap-southeast-2.amazonaws.com/v1/health`

## 3) Test Credentials (MVP Mock Auth)

MVP org endpoints are currently tested in mock auth mode with headers:

- `x-user-id: user_1`
- `x-tenant-id: ten_demo`
- `x-role: org_admin`

Alternative role for editor access:

- `x-role: org_editor`

## 4) Seeded Test Data

Seed command:

- `npm run seed:sample`

Default seeded values:

- `tenantId: ten_demo`
- `tenantCode: demo-school`
- `courseId: crs_demo_001`
- `formId: frm_demo_001`
- `formVersion: 1`

## 5) Quick API Examples

Get org profile:

```bash
curl -H "x-user-id: user_1" ^
     -H "x-tenant-id: ten_demo" ^
     -H "x-role: org_admin" ^
     https://y36enrj145.execute-api.ap-southeast-2.amazonaws.com/v1/org/me
```

List public courses:

```bash
curl https://y36enrj145.execute-api.ap-southeast-2.amazonaws.com/v1/public/demo-school/courses
```

Submit enrollment:

```bash
curl -X POST \
  -H "content-type: application/json" \
  -H "idempotency-key: 3c579f90-4962-4a49-9ced-e6a37f63500a" \
  -d "{\"formVersion\":1,\"answers\":{\"first_name\":\"Alice\",\"email\":\"alice@example.com\",\"consent_terms\":true}}" \
  https://y36enrj145.execute-api.ap-southeast-2.amazonaws.com/v1/public/demo-school/courses/crs_demo_001/enrollments
```

