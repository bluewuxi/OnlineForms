# OnlineForms

Backend scaffold for OnlineForms MVP.
See OnlineForms-Frontend Repository for frontend repository

OnlineForms is a multi-tenant SaaS application for education and training providers to publish courses, collect online enrollments through configurable forms, review submissions, and manage operations across public, tenant, and internal admin portals.

It was built as an AI-first engineering project to demonstrate how production-style software can be created through structured human + AI collaboration. The entire codebase was generated with Codex through an iterative workflow of requirement shaping, design and engineering review, implementation, bug fixing, code review, shipping, deployment verification, and documentation updates. The work was informed by prior real production experience, so the project reflects practical SaaS architecture, admin workflows, authentication patterns, and CI/CD practices rather than a toy prototype.

## Documentation

- `docs/specs/onlineforms_mvp_spec.md`
- `docs/specs/phase1-checklist.md`
- `docs/specs/phase2-checklist.md`
- `docs/specs/phase3-checklist.md`
- `docs/specs/phase4-checklist.md`
- `docs/specs/phase5-checklist.md`
- `docs/specs/phase6-checklist.md`
- `docs/specs/phase12-checklist.md`
- `docs/guides/MVP_USER_GUIDE.md`
- `docs/guides/AUTH_INCIDENT_RUNBOOK.md`
- `docs/guides/COGNITO_AUTH_TROUBLESHOOTING.md`
- `docs/guides/PHASE5_MIGRATION_RUNBOOK.md`
- `docs/guides/PHASE6_COGNITO_REFRESH_RUNBOOK.md`
- `docs/guides/PHASE6_AUTH_ROLELIST_MIGRATION.md`
- `docs/reference/api-contracts.md`
- `docs/reference/dynamodb-schema.md`
- `docs/reference/auth-claims-strategy.md`
- `docs/reference/ui-design-spec.md`

## Structure

- `infra/` deployment baseline (AWS SAM template)
- `services/` Lambda handlers and API code
- `shared/` shared utilities (correlation, guards, contracts)

## Current Internal Control-Plane Scope

The internal portal now includes a real internal-user management surface instead of the earlier grant/revoke-only directory.

Backend support in this repo now covers:

- canonical internal-user route family under `/v1/internal/users`
- create internal user with initial password, temporary-password option, initial roles, and enabled state
- activate / deactivate internal user
- explicit add-role / remove-role mutations
- password reset with temporary-password semantics
- per-user internal activity timeline
- explicit logout activity write path
- internal login activity write during session-context validation
- dedicated DynamoDB-backed internal activity store provisioned from SAM

See also:

- `docs/reference/api-contracts.md`
- `docs/reference/auth-context-rollout.md`
- `docs/reference/auth-claims-strategy.md`

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
npm test
```

## Deploy Baseline (SAM)

```bash
sam build -t infra/template.yaml
sam deploy --guided -t infra/template.yaml
```

### Cognito Bootstrap (Phase 4)

Template now supports managed Cognito provisioning:

- `ManagedCognitoEnabled=true` (default): creates User Pool, App Client, and groups
  - groups: `org_admin`, `org_editor`, `platform_admin`
- `ManagedCognitoEnabled=false`: use external values:
  - `ExternalCognitoUserPoolId`
  - `ExternalCognitoClientId`

Seed default user (`ricky`):

```powershell
.\scripts\seed-cognito-user.ps1 -UserPoolId <USER_POOL_ID>
```

### API Custom Domain + Route53 (Optional)

To create `form-api.kidrawer.com` as API custom domain in CloudFormation:

- set `ApiCustomDomainEnabled=true`
- provide `ApiCustomDomainCertificateArn` (ACM cert in same region as API)
- provide `ApiCustomDomainHostedZoneId` (Route53 hosted zone ID for `kidrawer.com`)

Example:

```bash
sam deploy -t infra/template.yaml \
  --parameter-overrides \
    ApiCustomDomainEnabled=true \
    ApiCustomDomainName=form-api.kidrawer.com \
    ApiCustomDomainCertificateArn=<acm-cert-arn> \
    ApiCustomDomainHostedZoneId=<route53-hosted-zone-id>
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

## P1-05 Public Catalog Endpoints

- `GET /v1/public/{tenantCode}/courses`
- `GET /v1/public/{tenantCode}/courses/{courseId}`
- `POST /v1/public/{tenantCode}/courses/{courseId}/enrollments`

## Phase 2 (in progress)

- `GET /v1/org/submissions`
- `GET /v1/org/submissions/{submissionId}`
- `PATCH /v1/org/submissions/{submissionId}`
- `POST /v1/org/assets/upload-ticket`
- `GET /v1/org/assets/{assetId}`
- `PATCH /v1/org/branding`
- `GET /v1/org/audit`
- `GET /v1/payments/config` (stub)
- `POST /v1/payments/checkout-session` (stub)
- `POST /v1/payments/webhook` (stub)

### Ops Baseline

CloudWatch baseline (deployed in SAM template):

- Dashboard: `${StackName}-overview`
- Alarm: API `5xx` sum >= `5` in 5 minutes
- Alarm: Public enrollment Lambda `Errors` sum >= `3` in 5 minutes
- Alarm: DynamoDB `ThrottledRequests` sum >= `1` in 5 minutes

Runbook starter:

1. Check API `5xx` and Lambda `Errors` widgets on dashboard.
2. Inspect CloudWatch logs for affected function and latest request IDs.
3. Check DynamoDB throttle alarm; if firing, inspect hot key patterns and retry behavior.

Public API baseline targets:

- Public catalog list (`GET /v1/public/{tenantCode}/courses`): p95 < 300ms
- Public course detail (`GET /v1/public/{tenantCode}/courses/{courseId}`): p95 < 250ms
- Public API 5xx rate target: < 0.5% per 5-minute window

Payment placeholder guardrails (MVP):

- `paymentEnabledFlag` stays `false` in all flows
- only `pricingMode=free` courses can become public/published
- `paid_placeholder` is reserved for future activation and cannot be public in MVP

## P1-08 Seed + Smoke

Seed sample tenant/course/form into DynamoDB:

```bash
npm run seed:sample
```

Override defaults if needed:

- `ONLINEFORMS_TABLE` (default: `OnlineFormsMain`)
- `SEED_TENANT_ID` (default: `ten_demo`)
- `SEED_TENANT_CODE` (default: `demo-school`)
- `SEED_DISPLAY_NAME` (default: `Demo School`)
- `SEED_COURSE_ID` (default: `crs_demo_001`)
- `SEED_FORM_ID` (default: `frm_demo_001`)
- `SEED_COURSE_TITLE` (default: `Intro to AI (Seeded)`)
- `SEED_SHORT_DESCRIPTION` (default: seeded smoke description)
- `SEED_FULL_DESCRIPTION` (default: seeded smoke full description)

Projection reconciliation helper:

```bash
TENANT_ID=ten_demo npm run reconcile:projections
```

Smoke request collection:

- `smoke/phase1-smoke.http`
- `smoke/phase2-smoke.http`
- `smoke/phase3-smoke.http`
- `smoke/phase4-cognito-smoke.http`
- `smoke/phase5-smoke.http`
- `smoke/phase6-cognito-smoke.http`

Phase 5 tenant-profile migration helper:

```bash
npm run migrate:tenant-profiles
```

To apply migration writes (default is dry-run):

```bash
MIGRATION_DRY_RUN=false npm run migrate:tenant-profiles
```

Phase 3 operational checks:

1. Projection drift:
`TENANT_ID=<tenantId> npm run reconcile:projections` and investigate non-zero repairs.
2. Audit trail health:
call `GET /v1/org/audit?limit=20` and verify recent actions include request/correlation IDs.
3. Payments stub guard:
call `/v1/payments/*` routes and verify consistent `409 CONFLICT` with `payments_disabled`.

When running in `AUTH_MODE=mock`, include headers:

- `x-user-id: user_1`
- `x-tenant-id: ten_001`
- `x-role: org_admin`
