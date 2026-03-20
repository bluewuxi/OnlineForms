# OnlineForms MVP DynamoDB Schema

## 1. Overview

This document defines the DynamoDB data model for OnlineForms MVP.

- Database: DynamoDB (on-demand)
- Pattern: two-table design
- Business table name: `OnlineFormsMain`
- Auth table name: `OnlineFormsAuth`
- Multi-tenant model: pooled table with strict tenant-scoped keys
- Primary requirement: every tenant-facing read/write is scoped by `tenantId`

---

## 2. Table and Keys

## 2.0 Business Table (`OnlineFormsMain`)

## 2.1 Primary Keys

- Partition key: `PK` (string)
- Sort key: `SK` (string)

## 2.2 Standard Metadata Attributes

Every item should include:

- `entityType` (e.g., `COURSE`, `FORM_VERSION`, `SUBMISSION`)
- `tenantId`
- `createdAt` (ISO UTC)
- `updatedAt` (ISO UTC)
- `createdBy` (nullable)
- `updatedBy` (nullable)

## 2.3 Key Prefix Conventions

- Tenant root: `TENANT#{tenantId}`
- Course: `COURSE#{courseId}`
- Submission: `SUBMISSION#{submissionId}`
- Form: `FORM#{formId}`
- Asset: `ASSET#{assetId}`
- Tenant code: `TENANTCODE#{tenantCode}`
- Idempotency: `IDEMP#{idempotencyKey}`

---

## 3. Global Secondary Indexes

## 3.1 `GSI1` (Tenant Feed / Type-Sorted Lists)

- `GSI1PK`
- `GSI1SK`

Used for:

- list courses by tenant + status
- list submissions by tenant
- list tenant assets

## 3.2 `GSI2` (Public Catalog by Tenant Code)

- `GSI2PK`
- `GSI2SK`

Used for:

- public list published courses by `tenantCode`
- public get course detail validation in tenant scope

## 3.3 `GSI3` (Submission by Course)

- `GSI3PK`
- `GSI3SK`

Used for:

- list submissions filtered by `courseId`

---

## 4. Entity Item Shapes

## 4.1 Tenant Profile

Purpose: internal platform tenant metadata.

```json
{
  "PK": "TENANT#ten_01",
  "SK": "PROFILE",
  "entityType": "TENANT",
  "tenantId": "ten_01",
  "tenantCode": "acme-school",
  "displayName": "Acme School",
  "status": "active",
  "branding": {
    "logoAssetId": "ast_01"
  },
  "createdAt": "2026-03-09T00:00:00Z",
  "updatedAt": "2026-03-09T00:00:00Z"
}
```

## 4.2 Tenant Code Directory

Purpose: resolve public route `tenantCode -> tenantId`.

```json
{
  "PK": "TENANTCODE#acme-school",
  "SK": "MAP",
  "entityType": "TENANT_CODE_MAP",
  "tenantCode": "acme-school",
  "tenantId": "ten_01",
  "status": "active",
  "createdAt": "2026-03-09T00:00:00Z",
  "updatedAt": "2026-03-09T00:00:00Z"
}
```

## 4.3 Course (Canonical)

Purpose: org course detail read/write.

```json
{
  "PK": "TENANT#ten_01",
  "SK": "COURSE#crs_01",
  "entityType": "COURSE",
  "tenantId": "ten_01",
  "courseId": "crs_01",
  "tenantCode": "acme-school",
  "title": "Intro to AI",
  "shortDescription": "4-week foundation course",
  "fullDescription": "Detailed syllabus...",
  "imageAssetId": "ast_01",
  "startDate": "2026-04-01",
  "endDate": "2026-04-28",
  "enrollmentOpenAt": "2026-03-10T00:00:00Z",
  "enrollmentCloseAt": "2026-03-31T23:59:59Z",
  "deliveryMode": "online",
  "locationText": null,
  "capacity": 120,
  "status": "published",
  "publicVisible": true,
  "pricingMode": "free",
  "paymentEnabledFlag": false,
  "activeFormId": "frm_01",
  "activeFormVersion": 3,
  "createdAt": "2026-03-09T01:00:00Z",
  "updatedAt": "2026-03-09T01:10:00Z",
  "createdBy": "usr_01",
  "updatedBy": "usr_01",
  "GSI1PK": "TENANT#ten_01#COURSES",
  "GSI1SK": "STATUS#published#UPDATED#2026-03-09T01:10:00Z#COURSE#crs_01",
  "GSI2PK": "TENANTCODE#acme-school#COURSES",
  "GSI2SK": "STATUS#published#START#2026-04-01#COURSE#crs_01"
}
```

## 4.4 Course Public Projection

Purpose: optimize public reads (optional but recommended).

```json
{
  "PK": "TENANT#ten_01",
  "SK": "COURSE_PUBLIC#crs_01",
  "entityType": "COURSE_PUBLIC",
  "tenantId": "ten_01",
  "tenantCode": "acme-school",
  "courseId": "crs_01",
  "title": "Intro to AI",
  "shortDescription": "4-week foundation course",
  "fullDescription": "Detailed syllabus...",
  "imageUrl": "https://cdn.onlineforms.com/assets/ast_01",
  "startDate": "2026-04-01",
  "endDate": "2026-04-28",
  "enrollmentOpenAt": "2026-03-10T00:00:00Z",
  "enrollmentCloseAt": "2026-03-31T23:59:59Z",
  "deliveryMode": "online",
  "pricingMode": "free",
  "status": "published",
  "publicVisible": true,
  "updatedAt": "2026-03-09T01:10:00Z",
  "GSI2PK": "TENANTCODE#acme-school#COURSES",
  "GSI2SK": "STATUS#published#START#2026-04-01#COURSE#crs_01"
}
```

## 4.5 Form Version

Purpose: immutable form schema versions.

```json
{
  "PK": "TENANT#ten_01",
  "SK": "COURSE#crs_01#FORMVER#0003",
  "entityType": "FORM_VERSION",
  "tenantId": "ten_01",
  "courseId": "crs_01",
  "formId": "frm_01",
  "version": 3,
  "status": "active",
  "fields": [
    {
      "fieldId": "first_name",
      "type": "short_text",
      "label": "First name",
      "required": true,
      "displayOrder": 1,
      "options": [],
      "validation": { "minLength": 1, "maxLength": 80 }
    }
  ],
  "createdAt": "2026-03-09T01:05:00Z",
  "updatedAt": "2026-03-09T01:05:00Z",
  "createdBy": "usr_01",
  "updatedBy": "usr_01"
}
```

## 4.6 Submission

Purpose: enrollment record and review lifecycle.

```json
{
  "PK": "TENANT#ten_01",
  "SK": "SUBMISSION#sub_01",
  "entityType": "SUBMISSION",
  "tenantId": "ten_01",
  "tenantCode": "acme-school",
  "submissionId": "sub_01",
  "courseId": "crs_01",
  "formId": "frm_01",
  "formVersion": 3,
  "status": "submitted",
  "applicant": { "email": "alice@example.com" },
  "answers": {
    "first_name": "Alice",
    "consent_terms": true
  },
  "submittedAt": "2026-03-09T01:30:00Z",
  "reviewedAt": null,
  "reviewedBy": null,
  "createdAt": "2026-03-09T01:30:00Z",
  "updatedAt": "2026-03-09T01:30:00Z",
  "GSI1PK": "TENANT#ten_01#SUBMISSIONS",
  "GSI1SK": "SUBMITTED#2026-03-09T01:30:00Z#SUBMISSION#sub_01",
  "GSI3PK": "TENANT#ten_01#COURSE#crs_01#SUBMISSIONS",
  "GSI3SK": "SUBMITTED#2026-03-09T01:30:00Z#SUBMISSION#sub_01"
}
```

## 4.7 Asset Metadata

Purpose: course image / org logo metadata for upload and retrieval.

```json
{
  "PK": "TENANT#ten_01",
  "SK": "ASSET#ast_01",
  "entityType": "ASSET",
  "tenantId": "ten_01",
  "assetId": "ast_01",
  "purpose": "course_image",
  "contentType": "image/png",
  "fileName": "intro-ai.png",
  "sizeBytes": 238100,
  "storageKey": "tenants/ten_01/assets/ast_01.png",
  "status": "uploaded",
  "createdAt": "2026-03-09T01:02:00Z",
  "updatedAt": "2026-03-09T01:03:00Z",
  "GSI1PK": "TENANT#ten_01#ASSETS",
  "GSI1SK": "CREATED#2026-03-09T01:02:00Z#ASSET#ast_01"
}
```

## 4.8 Public Enrollment Idempotency Record

Purpose: deduplicate `POST /enrollments`.

```json
{
  "PK": "TENANT#ten_01",
  "SK": "IDEMP#ed7f7c65-019f-4d4a-aeeb-33e17e7a8f44",
  "entityType": "IDEMPOTENCY",
  "tenantId": "ten_01",
  "idempotencyKey": "ed7f7c65-019f-4d4a-aeeb-33e17e7a8f44",
  "requestHash": "sha256:...",
  "submissionId": "sub_01",
  "responseSnapshot": {
    "submissionId": "sub_01",
    "status": "submitted",
    "submittedAt": "2026-03-09T01:30:00Z"
  },
  "createdAt": "2026-03-09T01:30:00Z",
  "ttlEpoch": 1773010200
}
```

TTL:

- enable DynamoDB TTL on attribute `ttlEpoch`
- keep 24h for idempotency records

---

## 5. Access Pattern Mapping

## 5.1 Tenant and Auth

- Resolve tenant by code (public):
  - `GetItem(PK=TENANTCODE#{tenantCode}, SK=MAP)`
- Get tenant profile (platform/internal):
  - `GetItem(PK=TENANT#{tenantId}, SK=PROFILE)`

## 5.2 Org Courses

- Create course:
  - `PutItem PK=TENANT#{tenantId}, SK=COURSE#{courseId}`
- Get course:
  - `GetItem PK=TENANT#{tenantId}, SK=COURSE#{courseId}`
- List courses by status:
  - `Query GSI1PK=TENANT#{tenantId}#COURSES`
  - optional `begins_with(GSI1SK, STATUS#{status}#...)`
- Publish/archive course:
  - `UpdateItem` course + update public projection item

## 5.3 Forms

- Upsert form schema version:
  - `PutItem PK=TENANT#{tenantId}, SK=COURSE#{courseId}#FORMVER#{versionPadded}`
- Get latest schema:
  - query base partition with `begins_with(SK, COURSE#{courseId}#FORMVER#)` descending, `Limit=1`
- Get exact version:
  - `GetItem` by exact `SK`

## 5.4 Public Catalog and Detail

- List published courses by tenantCode:
  - `Query GSI2PK=TENANTCODE#{tenantCode}#COURSES`
  - `begins_with(GSI2SK, STATUS#published#...)`
- Public course detail:
  - `GetItem PK=TENANT#{tenantId}, SK=COURSE_PUBLIC#{courseId}` (or canonical `COURSE#{courseId}`)

## 5.5 Submissions

- Create submission:
  - `PutItem PK=TENANT#{tenantId}, SK=SUBMISSION#{submissionId}`
- List submissions by tenant:
  - `Query GSI1PK=TENANT#{tenantId}#SUBMISSIONS`
- List submissions by course:
  - `Query GSI3PK=TENANT#{tenantId}#COURSE#{courseId}#SUBMISSIONS`
- Get submission detail:
  - `GetItem PK=TENANT#{tenantId}, SK=SUBMISSION#{submissionId}`
- Update submission status:
  - `UpdateItem` with transition checks (condition expression)

## 5.6 Assets

- Create upload metadata:
  - `PutItem PK=TENANT#{tenantId}, SK=ASSET#{assetId}`
- List assets (if needed):
  - `Query GSI1PK=TENANT#{tenantId}#ASSETS`

---

## 6. Conditional Write Rules

## 6.1 Tenant Code Uniqueness

Tenant code map must be unique:

- `PutItem` on `TENANTCODE#{tenantCode}` with
- `ConditionExpression = attribute_not_exists(PK)`

## 6.2 Publish Course Guard

Before publish:

- `status` must be `draft`
- `pricingMode` must be `free`
- `activeFormVersion` exists

Use `ConditionExpression` on course update.

## 6.3 Submission Status Transitions

Allowed:

- `submitted -> reviewed`
- `submitted -> canceled`

Block all other transitions via condition:

- `#status = :submitted`

## 6.4 Idempotent Enrollment

On create idempotency record:

- `PutItem` with `attribute_not_exists(PK) AND attribute_not_exists(SK)`
- if condition fails, read existing idempotency item and return stored response snapshot

---

## 7. Suggested Table Settings

- Billing mode: `PAY_PER_REQUEST`
- Point-in-time recovery: enabled
- TTL: enabled on `ttlEpoch`
- SSE: enabled (AWS managed key is acceptable for MVP)
- Stream: `NEW_AND_OLD_IMAGES` (optional, useful for future events/webhooks)

---

## 8. Data Retention and Growth Notes

- Form versions are immutable and accumulate over time.
- Submissions may become largest data class; GSI3 is important for course-level review screens.
- Idempotency records auto-expire via TTL.
- For high-volume tenants in future, consider partitioning heavy writes by monthly suffix:
  - e.g., `GSI1PK = TENANT#{tenantId}#SUBMISSIONS#2026-03`

---

## 9. Security and Tenant Isolation Rules

- All org/API lambda handlers must derive `tenantId` from JWT claim, never from client body/query.
- Every `GetItem`, `Query`, `UpdateItem`, and `DeleteItem` for org flows must include `PK` anchored to `TENANT#{tenantId}` or a tenant-prefixed GSI key.
- Any mismatch between resource tenant and caller tenant returns `403`.
- Public flow resolves `tenantCode -> tenantId` once, then all data reads remain tenant-scoped.

---

## 10. Endpoint to Key Cheat Sheet

- `GET /v1/org/courses/{courseId}`:
  - `PK=TENANT#{tenantId}`, `SK=COURSE#{courseId}`
- `GET /v1/public/{tenantCode}/courses`:
  - `GSI2PK=TENANTCODE#{tenantCode}#COURSES`
- `GET /v1/public/{tenantCode}/courses/{courseId}/form`:
  - resolve `tenantId`; then latest `FORMVER` under tenant partition
- `POST /v1/public/{tenantCode}/courses/{courseId}/enrollments`:
  - idempotency `PutItem` + submission `PutItem`
- `GET /v1/org/submissions?courseId=...`:
  - `GSI3PK=TENANT#{tenantId}#COURSE#{courseId}#SUBMISSIONS`

---

## 11. Auth Table Foundation (`OnlineFormsAuth`)

Purpose:

- isolate authentication and membership entities from business course/submission data
- keep future Cognito + membership flows independent of business table growth

Primary keys:

- `PK` (string)
- `SK` (string)

GSI:

- `GSI1PK` / `GSI1SK` for tenant-member listing

Auth key conventions:

- User root: `PK=USER#{userId}`
- User profile: `SK=PROFILE`
- User membership edge: `SK=MEMBERSHIP#{tenantId}`
- Tenant root for auth entities: `PK=TENANT#{tenantId}`
- Tenant member edge: `SK=MEMBER#{userId}`
- Tenant invite: `SK=INVITE#{inviteId}`
- Membership list GSI:
  - `GSI1PK=TENANT#{tenantId}#MEMBERS`
  - `GSI1SK=ROLE#{role}#USER#{userId}`

Auth entity types:

- `AUTH_USER_PROFILE`
- `AUTH_MEMBERSHIP`
- `AUTH_INVITE`

Invite and membership activation baseline:

- Invite item:
  - `PK=TENANT#{tenantId}`
  - `SK=INVITE#{inviteId}`
  - `status` (`pending|accepted`)
  - `expiresAt`
  - `acceptedAt` / `acceptedBy`
- Membership activation records on acceptance:
  - `PK=USER#{userId}`, `SK=MEMBERSHIP#{tenantId}` (user edge)
  - `PK=TENANT#{tenantId}`, `SK=MEMBER#{userId}` (tenant edge)
  - `allowedRoles` (new in Phase 6): list of tenant-scoped roles permitted for this membership
  - audit fields: `createdAt`, `updatedAt`, `createdBy`, `updatedBy`, `activatedAt`, `activatedBy`
