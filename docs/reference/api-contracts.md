# OnlineForms MVP API Contracts

## 1. Document Meta

- Product: OnlineForms
- Contract version: `v1`
- Status: Draft
- Base API URL (example): `https://onlineforms.kidrawer.com`
- Content type: `application/json; charset=utf-8`
- Time format: ISO 8601 UTC (example: `2026-03-09T02:31:22Z`)

### 1.1 Frontend Contract Audit Status (2026-03-25)

This document now reflects the implemented backend shape used by the upcoming UI work.

Important baseline notes from the audit:

- Course records use `activeFormId` and `activeFormVersion` in the backend model, not `formId` and `formVersion`.
- Submission records include UI-friendly summary fields:
  - `applicantSummary`
  - `course`
- Internal user management routes are under `/v1/internal/users`.
- Internal tenant management routes are under `/v1/internal/tenants`.
- Session bootstrap and context-selection routes are active:
  - `GET /v1/org/session-contexts`
  - `POST /v1/org/session-context`
- Additional org support routes are active and frontend-relevant:
  - `GET /v1/org/me`
  - `GET /v1/org/audit`
  - `PATCH /v1/org/branding`

---

## 2. Architecture and Routing

### 2.1 API Namespaces

- Organization (authenticated): `/v1/org/*`
- Public (anonymous): `/v1/public/*`
- Internal platform admin (optional): `/v1/platform/*`
- Future payments placeholder: `/v1/payments/*` (reserved, not active in MVP)

### 2.2 Tenant Resolution

- Organization APIs in Cognito mode resolve active `tenantId` from JWT tenant claim:
  - `custom:tenantId` (fallback `tenantId`)
- `x-tenant-id` header and route tenant context must match the JWT tenant claim when provided.
- `internal_admin` may omit tenant context only on dedicated internal-management endpoints.
- Public APIs resolve tenant by `tenantCode` in path.
- `tenantCode` route values must pass backend guardrails and cannot use reserved slugs such as `org`, `internal`, `api`, `admin`, `health`, or `courses`.
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
- Preferred stable custom claims:
  - `custom:tenantId` (required for non-`internal_admin` roles)
  - `custom:platformRole`
- Backward-compatible role fallbacks accepted in MVP:
  - role: `custom:role`, `role`, first `cognito:groups` entry

### 3.3 Role Access Matrix (MVP)

- `org_admin`: full tenant CRUD for courses/forms/submissions/settings.
- `org_editor`: create/update courses and forms, view submissions.
- `platform_admin`: limited bypass only for approved support endpoints (`/org/me`, `/org/tenants/{tenantId}/check`).
- `internal_admin`: internal management role for platform-operated management flows; tenant header may be optional only on internal-management endpoints.

Tenant context rule:

- Non-`internal_admin` org requests must carry a tenant in JWT claim.
- `x-tenant-id` is optional and cannot override JWT tenant claim.
- `x-tenant-id` may be optional for `internal_admin` on dedicated internal-management endpoints.

### 3.4 Membership Enforcement

- Non-platform users must have an active membership record in `OnlineFormsAuth` for the resolved tenant.
- Membership source record:
  - `PK=USER#{userId}`
  - `SK=MEMBERSHIP#{tenantId}`
- When membership contains `allowedRoles`, caller role must be included in this list.
- Backward compatibility: records without `allowedRoles` are treated as single-role memberships using `role`.
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

Auth token lifecycle details (`error.details[*].issue`) for `UNAUTHORIZED`:

- `token_missing`: request has no bearer token
- `token_malformed`: authorization header is not `Bearer <token>`
- `token_expired`: token expired (retryable with refresh flow)
- `token_invalid`: token signature/issuer/audience/claims verification failed

---

## 5. Data Contracts

## 5.1 Course

```json
{
  "id": "crs_01JABC...",
  "tenantId": "ten_01JABC...",
  "title": "Intro to AI",
  "shortDescription": "4-week foundation course",
  "fullDescription": "Detailed syllabus...",
  "imageAssetId": "ast_01JABC...",
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
  "activeFormId": "frm_01JABC...",
  "activeFormVersion": 3,
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
  "createdAt": "2026-03-09T01:30:00Z",
  "updatedAt": "2026-03-09T01:30:00Z",
  "applicantSummary": {
    "email": "alice@example.com",
    "name": "Alice"
  },
  "course": {
    "id": "crs_01JABC..."
  }
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
  "publicUrl": "https://signed-read-url.example.com/ast_01JABC..."
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
- `q`
- `pricingMode`
- `deliveryMode`
- `publicVisible`

Response `200`:

```json
{
  "data": [
    {
      "id": "crs_01JABC...",
      "tenantId": "ten_01JABC...",
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
      "status": "draft",
      "publicVisible": false,
      "pricingMode": "free",
      "paymentEnabledFlag": false,
      "imageAssetId": null,
      "activeFormId": "frm_01JABC...",
      "activeFormVersion": 3,
      "createdAt": "2026-03-09T01:00:00Z",
      "updatedAt": "2026-03-09T01:10:00Z",
      "createdBy": "usr_01J...",
      "updatedBy": "usr_01J...",
      "workflow": {
        "enrollmentStatus": "open",
        "hasActiveForm": true,
        "publishReady": true
      }
    }
  ],
  "page": { "limit": 20, "nextCursor": null }
}
```

### `GET /v1/org/courses/{courseId}`

Get full course details.

Response shape is the same as the course list item, including `workflow`.

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
    "version": 4,
    "summary": {
      "fieldCount": 6,
      "requiredFieldCount": 3,
      "fieldTypes": ["email", "short_text", "single_select"]
    }
  }
}
```

### `GET /v1/org/courses/{courseId}/form-schema`

Returns latest active schema plus a `summary` block:

- `fieldCount`
- `requiredFieldCount`
- `fieldTypes`

### `GET /v1/org/courses/{courseId}/form-schema/versions/{version}`

Returns specific immutable schema version plus the same `summary` block.

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
  "data": [
    {
      "id": "sub_01JABC...",
      "tenantId": "ten_01JABC...",
      "tenantCode": "std-school",
      "courseId": "crs_01JABC...",
      "formId": "frm_01JABC...",
      "formVersion": 3,
      "status": "submitted",
      "applicant": {
        "email": "alice@example.com"
      },
      "answers": {
        "first_name": "Alice"
      },
      "submittedAt": "2026-03-09T01:30:00Z",
      "reviewedAt": null,
      "reviewedBy": null,
      "createdAt": "2026-03-09T01:30:00Z",
      "updatedAt": "2026-03-09T01:30:00Z",
      "applicantSummary": {
        "email": "alice@example.com",
        "name": "Alice"
      },
      "course": {
        "id": "crs_01JABC...",
        "title": "Intro to AI"
      },
      "workflow": {
        "canReview": true,
        "isTerminal": false
      }
    }
  ],
  "page": { "limit": 20, "nextCursor": null }
}
```

### `GET /v1/org/submissions/{submissionId}`

Get submission details.

Response includes:

- `course.title` when course metadata is available
- `workflow.canReview`
- `workflow.isTerminal`

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

Current response additions for frontend flows:

- `asset.id`
- `asset.purpose`
- `asset.status`
- `asset.fileName`
- `asset.contentType`
- `asset.sizeBytes`
- `asset.publicUrl` (resolved browser-usable read URL; may be signed/expiring)

Validation:

- allowed MIME: `image/png`, `image/jpeg`, `image/webp`
- max size: 5 MB (MVP default)

---

## 6.5 Tenant Invites (Auth Baseline)

### `POST /v1/org/tenants/{tenantId}/invites`

Create a tenant invite record in `OnlineFormsAuth`.

Request body:

```json
{
  "email": "new-user@example.com",
  "role": "org_editor",
  "expiresInDays": 7
}
```

Rules:

- `role` allowed values: `org_admin`, `org_editor`
- `expiresInDays` optional, range `1..30` (default `7`)
- caller must be `org_admin` in tenant scope

### `POST /v1/org/tenants/{tenantId}/invites/{inviteId}/accept`

Accept invite and activate membership for authenticated Cognito identity (`sub`).

Server behavior:

- resolves user identity from JWT `sub`
- validates invite exists, is pending, and not expired
- writes membership activation records into `OnlineFormsAuth`

---

## 6.7 Org Session Bootstrap and Support

### `GET /v1/org/me`

Returns the authenticated org-session identity currently resolved by auth middleware.

Response `200`:

```json
{
  "data": {
    "userId": "usr_01J...",
    "tenantId": "ten_01J...",
    "role": "org_admin",
    "shell": {
      "portal": "org",
      "tenantScoped": true
    }
  }
}
```

Notes:

- `internal_admin` may receive `tenantId: null`.
- `shell.portal` is `internal` only when bootstrapping the internal shell without tenant context.

### `GET /v1/org/audit`

List audit events for the active tenant.

Filters:

- `action`
- `resourceType`
- `createdFrom`
- `createdTo`
- `limit`
- `cursor`

Response `200`:

```json
{
  "data": [
    {
      "id": "aud_01JABC...",
      "tenantId": "ten_01JABC...",
      "actorUserId": "usr_01J...",
      "action": "course.publish",
      "resourceType": "course",
      "resourceId": "crs_01JABC...",
      "correlationId": "corr_01JABC...",
      "requestId": "req_01JABC...",
      "details": {},
      "createdAt": "2026-03-09T01:30:00Z"
    }
  ],
  "page": { "limit": 20, "nextCursor": null }
}
```

### `PATCH /v1/org/branding`

Update tenant branding used by public and org pages.

Request body:

```json
{
  "logoAssetId": "ast_01JABC..."
}
```

Response `200`:

```json
{
  "data": {
    "tenantId": "ten_01JABC...",
    "logoAssetId": "ast_01JABC...",
    "logoUrl": "https://cdn.onlineforms.com/assets/ast_01JABC...",
    "updatedAt": "2026-03-09T01:30:00Z"
  }
}
```

---

## 6.6 Session Context APIs

### `GET /v1/org/session-contexts`

Returns tenant memberships/roles available for post-login context selection.

Query:

- `status` (optional CSV filter): `active|invited|suspended`

Response `200`:

```json
{
  "data": {
    "userId": "usr_01J...",
    "tokenRole": "org_admin",
    "canAccessInternalPortal": false,
    "availablePortals": ["org"],
    "selectionRequired": false,
    "suggestedContext": {
      "tenantId": "ten_01J...",
      "role": "org_admin",
      "portal": "org"
    },
    "contexts": [
      {
        "tenantId": "ten_01J...",
        "status": "active",
        "roles": ["org_admin", "org_editor"]
      }
    ]
  }
}
```

### `POST /v1/org/session-context`

Validates selected `tenantId` and `role` against active membership.

Request body:

```json
{
  "tenantId": "ten_01J...",
  "role": "org_admin"
}
```

Response `200`:

```json
{
  "data": {
    "userId": "usr_01J...",
    "tenantId": "ten_01J...",
    "role": "org_admin",
    "shell": {
      "portal": "org",
      "tenantScoped": true
    }
  }
}
```

Error handling notes for frontend bootstrap:

- `400 VALIDATION_ERROR` with `error.details[*].issue=tenant_required` when org roles omit `tenantId`
- `403 FORBIDDEN` with `error.details[*].issue=invalid_context` when the selected tenant/role is not allowed
- `401 UNAUTHORIZED` with token issues such as `token_expired` still uses the standard auth error envelope

---

## 7. Public API (Anonymous)

Tenant is resolved via `tenantCode` path segment.

## 7.1 Public Catalog

### `GET /v1/public/tenants`

Returns active tenant directory records for root home-page cards.

Query:

- `limit` (optional, default `50`, max `100`)

Response `200`:

```json
{
  "data": [
    {
      "tenantId": "001",
      "tenantCode": "std-school",
      "displayName": "Standard School",
      "description": "Public tenant landing content.",
      "isActive": true,
      "branding": {
        "logoAssetId": "ast_logo_001",
        "logoUrl": "https://cdn.onlineforms.com/assets/ast_logo_001"
      },
      "links": {
        "home": "/v1/public/std-school/tenant-home",
        "courses": "/v1/public/std-school/courses"
      }
    }
  ],
  "page": { "limit": 50, "nextCursor": null }
}
```

### `GET /v1/public/{tenantCode}/tenant-home`

Returns tenant landing payload used by `/{tenantCode}` page.

Response `200`:

```json
{
  "data": {
    "tenantCode": "std-school",
    "displayName": "Standard School",
    "description": "Tenant description",
    "homePageContent": "Welcome text",
    "isActive": true,
    "branding": {
      "logoAssetId": null,
      "logoUrl": null
    },
    "links": {
      "home": "/v1/public/std-school/tenant-home",
      "publishedCourses": "/v1/public/std-school/courses"
    }
  }
}
```

### `GET /v1/public/auth-options`

Returns login role options and tenant requirement semantics for frontend auth shell.

Response `200`:

```json
{
  "data": {
    "roles": [
      { "role": "org_admin", "label": "Org Admin", "requiresTenant": true },
      { "role": "org_editor", "label": "Org Editor", "requiresTenant": true },
      { "role": "internal_admin", "label": "Internal Admin", "requiresTenant": false },
      { "role": "platform_admin", "label": "Platform Admin", "requiresTenant": true }
    ]
  }
}
```

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
      "pricingMode": "free",
      "locationText": null,
      "enrollmentOpenAt": "2026-03-10T00:00:00Z",
      "enrollmentCloseAt": "2026-03-31T23:59:59Z",
      "enrollmentOpenNow": true,
      "enrollmentStatus": "open",
      "links": {
        "detail": "/v1/public/std-school/courses/crs_01JABC...",
        "enrollmentForm": "/v1/public/std-school/courses/crs_01JABC.../form"
      }
    }
  ],
  "page": { "limit": 20, "nextCursor": null }
}
```

### `GET /v1/public/{tenantCode}/courses/{courseId}`

Returns published course detail and enrollment window status.

Response `200`:

```json
{
  "data": {
    "id": "crs_01JABC...",
    "title": "Intro to AI",
    "shortDescription": "4-week foundation course",
    "fullDescription": "Detailed syllabus...",
    "imageUrl": "https://cdn.onlineforms.com/assets/ast_01JABC...",
    "startDate": "2026-04-01",
    "endDate": "2026-04-28",
    "deliveryMode": "online",
    "pricingMode": "free",
    "locationText": "Central campus",
    "capacity": 120,
    "enrollmentOpenAt": "2026-03-10T00:00:00Z",
    "enrollmentCloseAt": "2026-03-31T23:59:59Z",
    "enrollmentOpenNow": true,
    "enrollmentStatus": "open",
    "formAvailable": true,
    "links": {
      "detail": "/v1/public/std-school/courses/crs_01JABC...",
      "enrollmentForm": "/v1/public/std-school/courses/crs_01JABC.../form"
    }
  }
}
```

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
    "submittedAt": "2026-03-09T01:30:00Z",
    "tenantCode": "std-school",
    "courseId": "crs_01JABC...",
    "courseTitle": "Intro to AI",
    "links": {
      "tenantHome": "/v1/public/std-school/tenant-home",
      "course": "/v1/public/std-school/courses/crs_01JABC..."
    }
  }
}
```

Successful frontend-facing workflow telemetry now emits:

- `OnlineForms/Frontend.AssetUploadTicketCreateCount`
- `OnlineForms/Frontend.BrandingUpdateCount`
- `OnlineForms/Frontend.PublicEnrollmentCreateCount`

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

## 8.2 Internal Management API

### `GET /v1/internal/tenants`

List tenant profiles for internal management pages.

Query:

- `limit` (optional, default `100`, max `200`)

### `GET /v1/internal/tenants/{tenantId}`

Get a single tenant profile for internal drawer display/edit.

### `POST /v1/internal/tenants`

Create a new tenant profile for internal management.

Request body:

```json
{
  "tenantCode": "new-school",
  "displayName": "New School",
  "description": "Optional tenant description",
  "isActive": true,
  "homePageContent": "Optional tenant home content"
}
```

Validation expectations:

- `tenantCode` must pass reserved-slug and format guardrails.
- `tenantCode` must be globally unique.
- `displayName` required, length-limited.

### `GET /v1/internal/users`

List internal users for the internal access-control console directory.

Query:

- `limit` (optional, default `50`, max `200`)
- `cursor` (optional pagination cursor)

### `GET /v1/internal/users/{userId}`

Get internal user detail payload for the selected-user workspace, including read-only tenant memberships and internal roles.

Response payload shape:

```json
{
  "data": {
    "userId": "usr_internal_1",
    "username": "internal-user-1",
    "email": "internal-1@example.com",
    "preferredName": "Internal Operator",
    "enabled": true,
    "status": "CONFIRMED",
    "internalRoles": ["internal_admin"],
    "memberships": [
      {
        "tenantId": "001",
        "status": "active",
        "roles": ["org_admin", "org_editor"]
      }
    ]
  }
}
```

### `POST /v1/internal/users`

Create a new internal user with full initial setup.

Request body:

```json
{
  "email": "operator@example.com",
  "preferredName": "Operator Example",
  "password": "TempPassword1",
  "temporaryPassword": true,
  "internalRoles": ["internal_admin"],
  "enabled": true
}
```

Response `201`:

```json
{
  "data": {
    "userId": "usr_internal_1",
    "username": "internal-user-1",
    "email": "internal-1@example.com",
    "preferredName": "Operator Example",
    "enabled": true,
    "status": "FORCE_CHANGE_PASSWORD",
    "internalRoles": ["internal_admin"]
  }
}
```

Validation / behavior notes:

- `temporaryPassword=false` is allowed on create.
- UI day one may only expose `internal_admin`, but backend contract remains extensible.
- Creation writes internal-user activity records for user creation and initial access state.

### `POST /v1/internal/users/{userId}/activate`

Re-enable an internal user account.

Response `200`:

```json
{
  "data": {
    "userId": "usr_internal_1",
    "username": "internal-user-1",
    "email": "internal-1@example.com",
    "preferredName": "Operator Example",
    "enabled": true,
    "status": "CONFIRMED",
    "internalRoles": ["internal_admin"]
  }
}
```

### `POST /v1/internal/users/{userId}/deactivate`

Disable an internal user account.

Response shape matches the activate route.

### `POST /v1/internal/users/{userId}/roles/add`

Add one internal role explicitly.

Request body:

```json
{
  "role": "internal_admin"
}
```

Supported v1 backend values:

- `internal_admin`
- `platform_admin`

Response shape matches the detail summary fields and includes the updated `internalRoles`.

### `POST /v1/internal/users/{userId}/roles/remove`

Remove one internal role explicitly.

Request body:

```json
{
  "role": "internal_admin"
}
```

Guardrail notes:

- backend must prevent self-lockout and removal of the last high-privilege operator
- UI should treat blocked removals as operator-readable failures, not generic permission errors

### `POST /v1/internal/users/{userId}/password-reset`

Reset an internal user's password using temporary-password semantics.

Request body:

```json
{
  "password": "TempPassword1"
}
```

Response `200`:

```json
{
  "data": {
    "userId": "usr_internal_1",
    "passwordReset": true,
    "temporaryPassword": true
  }
}
```

Behavior notes:

- reset always requires the target user to change password on next login
- confirmation is handled in the frontend UI, not in the API contract

### `GET /v1/internal/users/{userId}/activity`

Return recent internal-user activity for the selected-user timeline.

Response `200`:

```json
{
  "data": [
    {
      "id": "act_01JABC",
      "userId": "usr_internal_1",
      "actorUserId": "usr_internal_9",
      "eventType": "internal_user.role_added",
      "summary": "Role internal_admin was added to internal-1@example.com.",
      "details": {
        "role": "internal_admin"
      },
      "createdAt": "2026-03-26T01:02:03.000Z"
    }
  ],
  "page": { "limit": 20, "nextCursor": null },
  "sourceStatus": "ok"
}
```

Timeline event types currently include:

- `internal_user.created`
- `internal_user.role_added`
- `internal_user.role_removed`
- `internal_user.activated`
- `internal_user.deactivated`
- `internal_user.password_reset`
- `internal_user.login`
- `internal_user.logout`

### `POST /v1/internal/users/activity/logout`

Write an explicit logout activity event for the current internal user session.

Response `200`:

```json
{
  "data": {
    "loggedOut": true
  }
}
```

### `PATCH /v1/internal/tenants/{tenantId}`

Update-only tenant profile fields used by management tooling:

- `displayName`
- `description`
- `isActive`
- `homePageContent`

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
- Auth decisions emit structured audit events (`type=auth_audit`) and auth metrics in namespace `OnlineForms/Auth`.
- Session-context diagnostics metrics:
  - `SessionContextsEmptyCount`
  - `SessionContextValidationSuccessCount`
  - `SessionContextValidationDeniedCount`
  - `SessionContextValidationInvalidCount`
- Frontend workflow metrics in namespace `OnlineForms/Frontend`:
  - `AssetUploadTicketCreateCount`
  - `BrandingUpdateCount`
  - `PublicEnrollmentCreateCount`

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
