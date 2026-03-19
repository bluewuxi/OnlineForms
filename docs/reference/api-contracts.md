# OnlineForms MVP API Contracts

## 1. Document Meta

- Product: OnlineForms
- Contract version: `v1`
- Status: Draft
- Base API URL (example): `https://onlineforms.kidrawer.com`
- Content type: `application/json; charset=utf-8`
- Time format: ISO 8601 UTC (example: `2026-03-09T02:31:22Z`)

---

## 2. Architecture and Routing

### 2.1 API Namespaces

- Organization (authenticated): `/v1/org/*`
- Public (anonymous): `/v1/public/*`
- Internal platform admin (optional): `/v1/platform/*`
- Future payments placeholder: `/v1/payments/*` (reserved, not active in MVP)

### 2.2 Tenant Resolution

- Organization APIs resolve active `tenantId` in this order:
  - `x-tenant-id` header (if provided)
  - route tenant context (for tenant-scoped routes like `/org/tenants/{tenantId}/check`)
  - JWT default tenant claim (`custom:tenantId` or `tenantId`)
- Public APIs resolve tenant by `tenantCode` in path.
- All records persisted with `tenantId`.
- Cross-tenant reads/writes must return `403 FORBIDDEN`.

### 2.3 Resource IDs

- `tenantId`: opaque string (example: `ten_01JABC...`)
- `courseId`: opaque string (example: `crs_01JABC...`)
- `formId`: opaque string (example: `frm_01JABC...`)
- `submissionId`: opaque string (example: `sub_01JABC...`)
- `assetId`: opaque string (example: `ast_01JABC...`)

---

## 3. Authentication and Authorization

### 3.1 Auth Mechanism

- Cognito JWT Bearer token for organization and platform endpoints.
- Header: `Authorization: Bearer <jwt>`

### 3.2 Required JWT Claims (minimum)

- `sub`: user ID
- `role`: one of:
  - `org_admin`
  - `org_editor`
  - `platform_admin` (internal)
- Optional default tenant claim:
  - `custom:tenantId` or `tenantId`

### 3.3 Role Access Matrix (MVP)

- `org_admin`: full tenant CRUD for courses/forms/submissions/settings.
- `org_editor`: create/update courses and forms, view submissions.
- `platform_admin`: limited bypass only for approved support endpoints (`/org/me`, `/org/tenants/{tenantId}/check`).

### 3.4 Membership Enforcement

- Non-platform users must have an active membership record in `OnlineFormsAuth` for the resolved tenant.
- Membership source record:
  - `PK=USER#{userId}`
  - `SK=MEMBERSHIP#{tenantId}`
- Missing or non-active membership returns `403 FORBIDDEN`.

---

## 4. API Conventions

### 4.1 Pagination

- Query:
  - `limit` (default 20, max 100)
  - `cursor` (opaque token)
- Response:
  - `page.limit`
  - `page.nextCursor` (nullable)

### 4.2 Sorting/Filtering

- Query conventions:
  - `sortBy=<field>`
  - `sortDir=asc|desc`
  - domain-specific filters (documented per endpoint)

### 4.3 Idempotency

- Public form submission supports idempotency:
  - Header: `Idempotency-Key: <uuid>`
  - Duplicate key within 24h returns the original successful result.

### 4.4 Correlation ID

- Request header supported: `X-Correlation-Id`.
- If absent, backend generates one.
- Response echoes `X-Correlation-Id`.

### 4.5 Error Envelope

All non-2xx responses:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "One or more fields are invalid.",
    "details": [
      { "field": "title", "issue": "required" }
    ]
  },
  "requestId": "req_01JABC...",
  "correlationId": "corr_01JABC..."
}
```

Common error codes:

- `UNAUTHORIZED`
- `FORBIDDEN`
- `NOT_FOUND`
- `CONFLICT`
- `VALIDATION_ERROR`
- `RATE_LIMITED`
- `INTERNAL_ERROR`

---

## 5. Data Contracts

## 5.1 Course

```json
{
  "id": "crs_01JABC...",
  "tenantId": "ten_01JABC...",
  "tenantCode": "acme-school",
  "title": "Intro to AI",
  "shortDescription": "4-week foundation course",
  "fullDescription": "Detailed syllabus...",
  "imageAssetId": "ast_01JABC...",
  "brandingRef": "default",
  "startDate": "2026-04-01",
  "endDate": "2026-04-28",
  "enrollmentOpenAt": "2026-03-10T00:00:00Z",
  "enrollmentCloseAt": "2026-03-31T23:59:59Z",
  "deliveryMode": "online",
  "locationText": null,
  "capacity": 120,
  "status": "draft",
  "publicVisible": false,
  "pricingMode": "free",
  "paymentEnabledFlag": false,
  "formId": "frm_01JABC...",
  "formVersion": 3,
  "createdAt": "2026-03-09T01:00:00Z",
  "updatedAt": "2026-03-09T01:10:00Z",
  "createdBy": "usr_01J...",
  "updatedBy": "usr_01J..."
}
```

Enums:

- `status`: `draft | published | archived`
- `pricingMode`: `free | paid_placeholder`
- `deliveryMode`: `online | onsite | hybrid`

## 5.2 Form Schema

```json
{
  "id": "frm_01JABC...",
  "tenantId": "ten_01JABC...",
  "courseId": "crs_01JABC...",
  "version": 3,
  "status": "active",
  "fields": [
    {
      "fieldId": "first_name",
      "type": "short_text",
      "label": "First name",
      "helpText": "As shown on official ID",
      "required": true,
      "displayOrder": 1,
      "options": [],
      "validation": {
        "minLength": 1,
        "maxLength": 80,
        "pattern": null
      }
    }
  ],
  "createdAt": "2026-03-09T01:00:00Z",
  "updatedAt": "2026-03-09T01:10:00Z"
}
```

Field `type` enum:

- `short_text`
- `long_text`
- `email`
- `phone`
- `number`
- `single_select`
- `multi_select`
- `checkbox`
- `date`

Form schema rules:

- `fieldId` unique per form version.
- `displayOrder` unique per form version.
- Existing versions immutable once referenced by a submission.

## 5.3 Submission

```json
{
  "id": "sub_01JABC...",
  "tenantId": "ten_01JABC...",
  "tenantCode": "acme-school",
  "courseId": "crs_01JABC...",
  "formId": "frm_01JABC...",
  "formVersion": 3,
  "status": "submitted",
  "applicant": {
    "email": "alice@example.com"
  },
  "answers": {
    "first_name": "Alice",
    "consent_terms": true,
    "topics": ["ai", "ethics"]
  },
  "submittedAt": "2026-03-09T01:30:00Z",
  "reviewedAt": null,
  "reviewedBy": null,
  "createdAt": "2026-03-09T01:30:00Z"
}
```

Submission `status` enum:

- `submitted`
- `reviewed`
- `canceled`

## 5.4 Asset Upload Ticket

```json
{
  "assetId": "ast_01JABC...",
  "uploadUrl": "https://s3-presigned-url",
  "method": "PUT",
  "headers": {
    "Content-Type": "image/png"
  },
  "expiresAt": "2026-03-09T02:00:00Z",
  "publicUrl": "https://cdn.onlineforms.com/assets/ast_01JABC..."
}
```

---

## 6. Organization API (Authenticated)

## 6.1 Courses

### `POST /v1/org/courses`

Create a course in draft state.

Request body:

```json
{
  "title": "Intro to AI",
  "shortDescription": "4-week foundation course",
  "fullDescription": "Detailed syllabus...",
  "startDate": "2026-04-01",
  "endDate": "2026-04-28",
  "enrollmentOpenAt": "2026-03-10T00:00:00Z",
  "enrollmentCloseAt": "2026-03-31T23:59:59Z",
  "deliveryMode": "online",
  "locationText": null,
  "capacity": 120,
  "pricingMode": "free",
  "imageAssetId": null
}
```

Response `201`:

```json
{
  "data": { "id": "crs_01JABC...", "status": "draft" }
}
```

### `GET /v1/org/courses`

List tenant courses.

Filters:

- `status`
- `q` (title contains)
- `pricingMode`

Response `200`:

```json
{
  "data": [],
  "page": { "limit": 20, "nextCursor": null }
}
```

### `GET /v1/org/courses/{courseId}`

Get full course details.

### `PATCH /v1/org/courses/{courseId}`

Partial update for editable fields.

### `POST /v1/org/courses/{courseId}/publish`

Publish draft course.

Validation preconditions:

- `status` currently `draft`
- active form exists
- form has at least one required applicant identity field (`email` recommended)
- `pricingMode` must be `free` in MVP

Response `200`:

```json
{
  "data": {
    "id": "crs_01JABC...",
    "status": "published",
    "publicVisible": true
  }
}
```

### `POST /v1/org/courses/{courseId}/archive`

Archive course and hide from public catalog.

---

## 6.2 Forms

### `PUT /v1/org/courses/{courseId}/form-schema`

Upsert draft form schema and bump version if already active.

Request body:

```json
{
  "fields": [
    {
      "fieldId": "first_name",
      "type": "short_text",
      "label": "First name",
      "required": true,
      "displayOrder": 1,
      "helpText": null,
      "options": [],
      "validation": { "minLength": 1, "maxLength": 80 }
    }
  ]
}
```

Response `200`:

```json
{
  "data": {
    "formId": "frm_01JABC...",
    "version": 4
  }
}
```

### `GET /v1/org/courses/{courseId}/form-schema`

Returns latest active schema.

### `GET /v1/org/courses/{courseId}/form-schema/versions/{version}`

Returns specific immutable schema version.

---

## 6.3 Submissions

### `GET /v1/org/submissions`

List submissions in tenant scope.

Filters:

- `courseId`
- `status`
- `submittedFrom`
- `submittedTo`

Response `200`:

```json
{
  "data": [],
  "page": { "limit": 20, "nextCursor": null }
}
```

### `GET /v1/org/submissions/{submissionId}`

Get submission details.

### `PATCH /v1/org/submissions/{submissionId}`

Update review status.

Request body:

```json
{
  "status": "reviewed"
}
```

Rules:

- Allowed transitions: `submitted -> reviewed`, `submitted -> canceled`
- Terminal statuses cannot transition back to `submitted`.

---

## 6.4 Assets

### `POST /v1/org/assets/upload-ticket`

Create pre-signed upload ticket.

Request body:

```json
{
  "purpose": "course_image",
  "contentType": "image/png",
  "fileName": "intro-ai.png",
  "sizeBytes": 238100
}
```

Response `201`: `Asset Upload Ticket` object.

Validation:

- allowed MIME: `image/png`, `image/jpeg`, `image/webp`
- max size: 5 MB (MVP default)

---

## 7. Public API (Anonymous)

Tenant is resolved via `tenantCode` path segment.

## 7.1 Public Catalog

### `GET /v1/public/{tenantCode}/courses`

Returns only published and public-visible courses.

Query:

- `q` (optional keyword)

Response `200`:

```json
{
  "data": [
    {
      "id": "crs_01JABC...",
      "title": "Intro to AI",
      "shortDescription": "4-week foundation course",
      "imageUrl": "https://cdn.onlineforms.com/assets/ast_01JABC...",
      "startDate": "2026-04-01",
      "endDate": "2026-04-28",
      "deliveryMode": "online",
      "pricingMode": "free"
    }
  ],
  "page": { "limit": 20, "nextCursor": null }
}
```

### `GET /v1/public/{tenantCode}/courses/{courseId}`

Returns published course detail and enrollment window status.

---

## 7.2 Public Form and Enrollment

### `GET /v1/public/{tenantCode}/courses/{courseId}/form`

Returns active form schema for rendering.

Response `200`:

```json
{
  "data": {
    "formId": "frm_01JABC...",
    "version": 3,
    "fields": []
  }
}
```

### `POST /v1/public/{tenantCode}/courses/{courseId}/enrollments`

Submit enrollment responses.

Headers:

- `Idempotency-Key` required

Request body:

```json
{
  "formVersion": 3,
  "answers": {
    "first_name": "Alice",
    "email": "alice@example.com",
    "consent_terms": true
  },
  "meta": {
    "locale": "en-NZ",
    "timezone": "Pacific/Auckland"
  }
}
```

Server behavior:

- Validates `course` is published and currently open for enrollment.
- Validates payload against exact stored schema version.
- Stores submission with `status=submitted`.

Response `201`:

```json
{
  "data": {
    "submissionId": "sub_01JABC...",
    "status": "submitted",
    "submittedAt": "2026-03-09T01:30:00Z"
  }
}
```

---

## 8. Platform Admin API (Optional/Internal)

## 8.1 Tenants

### `POST /v1/platform/tenants`

Create tenant.

Request body:

```json
{
  "tenantCode": "acme-school",
  "displayName": "Acme School",
  "status": "active"
}
```

### `GET /v1/platform/tenants/{tenantId}`

Fetch tenant metadata.

### `PATCH /v1/platform/tenants/{tenantId}`

Update tenant metadata/status.

---

## 9. Validation Rules

## 9.1 Course Validation

- `title`: required, 1-120 chars.
- `shortDescription`: required, max 280 chars.
- `fullDescription`: required, max 10000 chars.
- `startDate <= endDate`.
- `enrollmentOpenAt < enrollmentCloseAt`.
- For MVP, `pricingMode` must equal `free` for publish action.

## 9.2 Form Field Validation

- `fieldId`: `^[a-z][a-z0-9_]{1,63}$`.
- `label`: required, max 120.
- `single_select` and `multi_select` require non-empty `options`.
- `email` uses RFC-compliant validation.
- `phone` basic E.164 normalization for storage when possible.

## 9.3 Submission Validation

- Unknown fields rejected.
- Missing required fields rejected.
- Type mismatches rejected.
- Maximum payload size: 256 KB.

---

## 10. Rate Limits (MVP Defaults)

- Org authenticated endpoints: `300 req/min` per user token.
- Public catalog endpoints: `600 req/min` per IP.
- Public enrollment submit endpoint: `60 req/min` per IP + tenant.

Return `429 RATE_LIMITED` when exceeded.

---

## 11. Auditing and Observability

- Audit metadata persisted on mutating org/platform endpoints:
  - `createdAt`, `createdBy`, `updatedAt`, `updatedBy`
- Structured logs include:
  - `requestId`
  - `correlationId`
  - `tenantId` or `tenantCode`
  - `route`
  - `statusCode`
  - latency

---

## 12. Security Requirements

- JWT signature and expiration verification on protected endpoints.
- Tenant scope enforcement from claims on every data access.
- Input validation before persistence.
- Output encoding and safe JSON serialization.
- S3 pre-signed upload ticket expiration <= 15 minutes.

---

## 13. Versioning and Backward Compatibility

- URI major versioning: `/v1`.
- Additive changes allowed in `v1` (new optional fields/endpoints).
- Breaking changes require `/v2`.
- Form schema versions immutable once used by a submission.

---

## 14. Scope Clarifications from MVP Spec

The source MVP spec has one conflict:

- Section `5.1 In Scope` includes enrollment confirmation email.
- Section `3.2 Non-Goals` and `18.2` mark email notifications as out of scope.

API contract decision for MVP:

- Enrollment API returns on-screen success only.
- No email dispatch endpoint in MVP.
- Keep event hooks internal so email can be added later without breaking contract.
