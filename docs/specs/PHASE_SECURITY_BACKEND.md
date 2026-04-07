# OnlineForms Backend — Security Hardening Phase

Source: Security review covering public form abuse prevention, input validation, infrastructure hardening, auth hygiene, and information leakage. Companion frontend phase: `OnlineForms-Frontend/docs/specs/PHASE_SECURITY_FRONTEND.md`.

## Goals

- Rate-limit public enrollment submissions to prevent automated abuse
- Verify CAPTCHA tokens server-side before processing submissions
- Validate and sanitise all user-supplied input before writing to DynamoDB
- Harden AWS infrastructure configuration (CORS, S3, Cognito)
- Eliminate information leakage from API error responses and tenant endpoints
- Ensure audit trail completeness across all write operations

## Scope

Backend Lambda handlers, API Gateway configuration, DynamoDB access patterns, S3 upload policies, and Cognito settings. No frontend changes are introduced by this phase (frontend counterparts are in the frontend phase).

## Workflow Rule

Implement tasks strictly in order. For each task:
1. Implement feature
2. Write brief change summary in linked GitHub issue
3. Update checklist status
4. Move to next task

## Tasks

- [ ] BS-01 Enrollment submission rate limiting
  Issue: https://github.com/bluewuxi/OnlineForms/issues/81
  Scope:
  - Enforce a maximum of 10 enrollment submissions per IP address per hour on `POST /v1/public/{tenantCode}/courses/{courseId}/enrollments`
  - Implementation using a dedicated DynamoDB table (`OnlineFormsRateLimit`):
    - A separate table is used to keep `OnlineFormsMain` for business data only; system/operational data lives separately
    - Provision `OnlineFormsRateLimit` in the SAM template with `BillingMode: PAY_PER_REQUEST` and TTL enabled on the `expiresAt` attribute
    - On each submission request, derive a rate-limit key: `RATELIMIT#${ip}#${Math.floor(Date.now() / 3600000)}` (bucketed by hour)
    - Use a DynamoDB `UpdateItem` with `ADD #count :one` and `ConditionExpression: #count < :limit` (atomic increment + conditional check in one operation)
    - Set `expiresAt` TTL to 2 hours from the current hour boundary so old records self-expire
    - If the condition fails (count >= 10), return `429 Too Many Requests` with body `{ "code": "RATE_LIMITED", "message": "Too many submissions. Please try again later.", "retryAfter": <seconds until next hour bucket> }`
    - Use `X-Forwarded-For` header (API Gateway populates this) for the IP; take only the first IP in the chain to handle proxies
  - Add `AUTH_MODE=mock` bypass: skip rate limiting when running in mock mode so local development is unaffected
  Acceptance:
  - 11th submission from the same IP in the same hour returns `429`
  - Counter resets after the hour bucket rolls over
  - `retryAfter` value in the response is accurate
  - Mock mode bypasses rate limiting
  - Unit test covers the counter increment and the limit breach path

- [ ] BS-02 CAPTCHA token verification (Cloudflare Turnstile)
  Issue: https://github.com/bluewuxi/OnlineForms/issues/82
  Scope:
  - Before processing an enrollment submission, verify the Cloudflare Turnstile token sent by the frontend as `_captchaToken` in the request body
  - Implementation:
    - Add `TURNSTILE_SECRET_KEY` as a Lambda environment variable (stored in AWS SSM Parameter Store, not hardcoded)
    - After extracting the request body, call `https://challenges.cloudflare.com/turnstile/v0/siteverify` via HTTPS POST with `{ secret: TURNSTILE_SECRET_KEY, response: body._captchaToken, remoteip: clientIp }`
    - If the response `success: false`, return `403 Forbidden` with body `{ "code": "CAPTCHA_FAILED", "message": "CAPTCHA verification failed. Please reload and try again." }`
    - If `TURNSTILE_ENABLED` environment variable is `false` (local/test), skip verification entirely
    - CAPTCHA check should run before rate-limit check (fail fast on obvious bots)
    - Handle Cloudflare API timeout gracefully: if the verify call times out (>3s), log a warning and allow the submission through — do not block real users due to Cloudflare downtime
  Acceptance:
  - Valid token allows submission to proceed
  - Invalid/missing token returns `403` with `CAPTCHA_FAILED` code
  - `TURNSTILE_ENABLED=false` skips verification in dev/test
  - Cloudflare API timeout does not block legitimate users
  - Unit test mocks the Cloudflare verify call for both success and failure paths

- [ ] BS-03 Honeypot field server-side rejection
  Issue: https://github.com/bluewuxi/OnlineForms/issues/83
  Scope:
  - The frontend sends a `_hp` boolean field in the enrollment payload when the honeypot input was filled (see frontend task FS-03)
  - If `body._hp === true`, log the attempt (include IP, tenantCode, courseId, timestamp) and return `200 OK` with a fake success response — do not write to DynamoDB, do not return an error (silently discard to avoid alerting the bot)
  - Strip `_hp` and `_captchaToken` from the payload before any further processing or storage — these are control fields, not data fields
  - Add a dedicated CloudWatch metric `HoneypotHit` so abuse patterns can be monitored over time without noise in the main error metrics
  Acceptance:
  - Honeypot-flagged submissions return `200` but nothing is written to DynamoDB
  - `HoneypotHit` CloudWatch metric is emitted on each flagged request
  - `_hp` and `_captchaToken` are never stored in DynamoDB

- [ ] BS-04 Enrollment submission input validation
  Issue: https://github.com/bluewuxi/OnlineForms/issues/84
  Scope:
  - Currently the enrollment Lambda writes answer values to DynamoDB with minimal validation. Add a validation layer before the write:
    - For each answer field, look up its definition in the stored form schema
    - Validate: `required` fields must have a non-empty value; `text`/`textarea` values must not exceed their `maxLength` (500 and 5000 respectively); `email` fields must match a basic RFC 5321 pattern; `select` values must be one of the defined options
    - Strip HTML tags from all free-text answer values using a simple regex (`/<[^>]*>/g`) before storing — do not attempt to sanitise HTML, just remove it entirely
    - If validation fails, return `422 Unprocessable Entity` with a structured error: `{ "code": "VALIDATION_ERROR", "fields": [{ "fieldId": "...", "error": "..." }] }`
    - Reject the entire submission if any required field is missing or any field exceeds its limit
  Acceptance:
  - Missing required field returns `422` with the relevant `fieldId`
  - Oversized text field returns `422` with the relevant `fieldId`
  - HTML tags are stripped from stored answer values
  - Invalid select option returns `422`
  - Unit tests cover required, maxLength, email format, and HTML strip cases

- [ ] BS-05 CORS policy restriction
  Issue: https://github.com/bluewuxi/OnlineForms/issues/85
  Scope:
  - Current API Gateway CORS configuration allows all origins (`*`) for public endpoints. Restrict to known frontend origins:
    - Production: `https://form.kidrawer.com` (or whatever the production domain is)
    - Staging: `https://stage.form.kidrawer.com` (if applicable)
    - Local dev: `http://localhost:5173` (Vite default)
  - Update the SAM template CORS configuration to use an `AllowedOrigins` list driven by a `CorsAllowedOrigins` parameter, defaulting to the production URL
  - Verify that preflight `OPTIONS` requests return the correct `Access-Control-Allow-Origin` header
  - For org and internal endpoints, only the org portal origin should be allowed (same domain in this case, but explicit is better)
  Acceptance:
  - Requests from unlisted origins receive a `403` on preflight
  - Requests from allowed origins receive the correct CORS headers
  - Local dev still works with `http://localhost:5173`
  - SAM template parameter controls the allowed origins list

- [ ] BS-06 S3 upload policy hardening
  Issue: https://github.com/bluewuxi/OnlineForms/issues/86
  Scope:
  - The `POST /v1/org/assets/upload-ticket` endpoint issues S3 pre-signed URLs for asset uploads (tenant logos, branding images). Harden the upload policy:
    - Enforce an allowed MIME type list in the pre-signed URL conditions: `image/jpeg`, `image/png`, `image/webp`, `image/svg+xml` only
    - Enforce a maximum file size of 5MB via `content-length-range` condition in the pre-signed POST policy
    - Set `Content-Disposition: attachment` on uploaded objects so browsers download rather than render them — prevents stored XSS via SVG or HTML files disguised as images
    - Ensure the S3 bucket has `BlockPublicAcls: true` and `IgnorePublicAcls: true` — assets should only be served via pre-signed GET URLs, never via public bucket URL
    - Add a bucket policy that denies `s3:GetObject` without a pre-signed URL context (i.e. no public `GetObject` via direct URL)
  Acceptance:
  - Upload attempt with a non-image MIME type is rejected at S3 (pre-signed policy condition fails)
  - Upload attempt exceeding 5MB is rejected
  - Uploaded objects are not publicly accessible via direct S3 URL
  - Existing upload flow for permitted file types continues to work

- [ ] BS-07 Tenant slug enumeration hardening
  Issue: https://github.com/bluewuxi/OnlineForms/issues/87
  Scope:
  - `GET /v1/public/{tenantCode}/courses` and `GET /v1/public/tenants/{tenantCode}` currently return different responses for inactive tenants vs. non-existent ones, allowing an attacker to enumerate valid tenant codes by comparing responses
  - Standardise the response: both inactive and non-existent tenants should return `404 Not Found` with an identical generic body: `{ "code": "NOT_FOUND", "message": "The requested resource was not found." }`
  - Ensure the response time is consistent (no timing difference between DB miss and inactive record) — add a small fixed-time delay if needed, or ensure the DynamoDB read path is identical for both cases
  - Review all public endpoints for similar leakage patterns
  Acceptance:
  - Non-existent tenant returns `404` with `NOT_FOUND` code
  - Inactive tenant returns `404` with the same `NOT_FOUND` code and identical body
  - Response time difference between the two cases is < 50ms

- [ ] BS-08 API error response sanitisation
  Issue: https://github.com/bluewuxi/OnlineForms/issues/88
  Scope:
  - Audit all Lambda error handlers for stack traces, internal variable names, DynamoDB table names, or AWS account details leaking into API responses
  - Implement a centralised error serialiser that:
    - In production (`NODE_ENV=production` or `DEPLOYMENT_ENVIRONMENT != local`): returns only `{ "code": "...", "message": "..." }` — no stack traces, no internal details
    - In local/dev mode: may include additional debug info
    - Maps unhandled errors to a generic `{ "code": "INTERNAL_ERROR", "message": "An unexpected error occurred." }` `500` response
  - Ensure CloudWatch still receives full error details (log the full error before serialising the response)
  Acceptance:
  - No stack trace appears in any API response in production mode
  - No DynamoDB table names or AWS ARNs appear in responses
  - Unhandled errors return `500` with the generic `INTERNAL_ERROR` code
  - Full error details are still logged to CloudWatch

- [ ] BS-09 Audit trail completeness review
  Issue: https://github.com/bluewuxi/OnlineForms/issues/89
  Scope:
  - Review all write operations across org and internal Lambda handlers and verify each produces an audit trail entry
  - Minimum required audit events:
    - Course: create, publish, archive, form schema update
    - Enrollment submission: create, status update (reviewed/cancelled)
    - Branding: update
    - Internal user: create, activate, deactivate, role change, password reset
    - Tenant: create, update, activate, deactivate
  - For any write operation missing an audit entry, add one with: `actorId`, `tenantId`, `action`, `resourceType`, `resourceId`, `timestamp`, `correlationId`
  - Verify the existing audit log endpoint `GET /v1/org/audit` returns entries for all of the above event types
  Acceptance:
  - All listed write operations produce an audit entry
  - Audit entries include all required fields
  - `GET /v1/org/audit` returns entries for all event types in testing
  - Unit tests verify audit writes for at least the enrollment create and course publish paths

- [ ] BS-10 Dependency vulnerability scanning
  Issue: https://github.com/bluewuxi/OnlineForms/issues/90
  Scope:
  - Add `npm audit --audit-level=high` to the CI/build pipeline so high/critical CVEs fail the build
  - Enable GitHub Dependabot for the `OnlineForms` repository:
    - Create `.github/dependabot.yml` with weekly `npm` updates targeting the `master` branch
    - Group patch updates into a single PR
  - Resolve any currently open `npm audit` findings of severity `high` or above before closing this task
  Acceptance:
  - `npm audit --audit-level=high` exits 0 on current dependencies
  - Dependabot config file is present and valid

## Status Legend

- `[ ]` Not started
- `[~]` In progress
- `[x]` Completed

## Primary References

- `services/` — Lambda handler entry points
- `infra/template.yaml` — SAM template (CORS, S3 bucket config)
- `docs/reference/api-contracts.md` — endpoint definitions
- `docs/reference/dynamodb-schema.md` — table structure for rate limit counter design
- `OnlineForms-Frontend/docs/specs/PHASE_SECURITY_FRONTEND.md` — companion frontend phase
