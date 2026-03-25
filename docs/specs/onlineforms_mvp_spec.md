# OnlineForms MVP Product Spec

## 1. Document Control

- **Product**: OnlineForms
- **Version**: MVP v1.0
- **Status**: Draft
- **Primary Goal**: Define the MVP scope, architecture principles, data model, workflows, and non-functional requirements for a serverless SaaS platform that allows educational organizations to publish free courses and manage customizable enrollment forms.

---

## 2. Product Overview

### 2.1 Summary
OnlineForms is a multi-tenant SaaS platform for educational organizations to manage and publish courses with customizable enrollment forms. Public users can browse available courses and enroll through dynamic forms.

The MVP supports **free courses only**. Payment is not enabled in the initial release, but the domain model and API contracts should preserve a clear extension path for future paid enrollment.

### 2.2 Core Value Proposition
For educational organizations:
- Publish and manage free courses without building custom enrollment workflows.
- Configure enrollment forms per course.
- Collect, review, and export enrollment data in a structured way.

For end users:
- Discover courses through a public portal.
- Complete a course-specific enrollment form with a simple, mobile-friendly experience.
- Receive confirmation after successful submission.

### 2.3 Why Serverless
The product is designed for a serverless AWS architecture because the expected usage profile is low-to-medium volume with bursty seasonal peaks.

Serverless benefits:
- **Usage-based cost model**: pay for actual requests, executions, and reads/writes.
- **Elastic scaling**: supports spikes during semester openings or campaign launches.
- **Minimal operational overhead**: no server fleet management for the MVP team.
- **Good fit for DynamoDB on-demand**: avoids overprovisioning under uncertain early traffic.

---

## 3. Goals and Non-Goals

### 3.1 MVP Goals
1. Support multi-tenant course publishing for educational organizations.
2. Allow organization users to create and manage customizable enrollment forms.
3. Allow public users to browse published free courses within a tenant-branded portal.
4. Allow public users to submit enrollment forms.
5. Store submissions with strict tenant isolation.
6. Provide a clean extension path for future payment support.

### 3.2 Non-Goals for MVP
1. Online payment collection.
2. Email notifications.
3. Advanced workflow automation.
4. CRM integrations.
5. Rich analytics beyond basic operational metrics.
6. Complex approval pipelines.
7. Full marketing website CMS.
8. Native mobile applications.
9. Fine-grained role-based permission matrix beyond essential MVP roles.
10. CSV export of submissions.
11. Cross-tenant querying from tenant-facing flows.

## 4. Target Users

### 4.1 Organization Users
Users from educational organizations who manage courses and enrollment forms.

Typical responsibilities:
- Create and edit courses.
- Configure enrollment form fields.
- Publish and unpublish courses.
- View enrollment submissions.

### 4.2 Public Applicants
Anonymous or guest users who browse available courses and complete enrollment forms.

Typical responsibilities:
- Search and view course details.
- Fill and submit enrollment forms.
- Receive confirmation email.

### 4.3 Internal Platform Admin (Optional, Limited MVP Use)
Internal operator role for support and tenant administration.

Typical responsibilities:
- Provision tenants.
- Support troubleshooting.
- Review operational issues.

---

## 5. Scope

### 5.1 In Scope
- Multi-tenant SaaS architecture with pooled infrastructure.
- Organization authentication via Amazon Cognito.
- Public course catalog.
- Course CRUD for organization users.
- Form schema builder for configurable enrollment forms.
- Form rendering based on stored schema.
- Submission capture and persistence.
- Enrollment confirmation email.
- Asset storage for logos and course images.
- Basic observability and audit metadata.

### 5.2 Out of Scope
- Payment processing execution.
- Refunds, invoices, and tax handling.
- File upload in forms unless explicitly enabled later.
- Waitlist logic.
- Capacity-based seat reservation logic beyond simple published metadata.
- Multi-language localization.
- Advanced reporting dashboards.

---

## 6. Functional Requirements

### 6.1 Tenant Management
- The system shall support multiple educational organizations on shared infrastructure.
- Every application record shall include `tenantId`.
- Organization user identity shall include tenant context, ideally through Cognito custom attributes or mapped claims.
- Every protected backend operation shall validate tenant access from JWT claims.
- Tenant profile shall support `description`, `isActive`, and optional `homePageContent`.
- Tenant codes shall be unique and validated against a reserved-slug list to avoid route collisions.

### 6.2 Organization Authentication
- Organization users shall sign in through Amazon Cognito User Pools.
- Protected API endpoints shall require a valid JWT.
- MVP roles should be minimal:
  - `org_admin`
  - `org_editor`
  - `platform_admin` (optional/internal)
  - `internal_admin` (internal management workflows; tenant context optional on internal endpoints)

### 6.3 Course Management
Organization users shall be able to:
- Create a course.
- Edit course metadata.
- Set publication status.
- Attach a customizable enrollment form.
- Upload/select a course image.
- Define whether the course is free.

Course metadata should include:
- Title
- Short description
- Full description
- Course image
- Organization branding reference
- Start date / end date
- Enrollment open / close dates
- Location or delivery mode
- Capacity placeholder
- Status: draft / published / archived
- Pricing mode: free / paid_placeholder

### 6.4 Form Builder
Organization users shall be able to define a per-course form schema.

Supported MVP field types:
- short text
- long text
- email
- phone
- number
- single select
- multi select
- checkbox
- date

Field configuration should include:
- field ID
- label
- help text
- type
- required flag
- options (for select fields)
- validation constraints
- display order

MVP assumptions:
- Basic conditional logic is out of scope.
- Versioning should be lightweight but present enough to preserve submission integrity.

### 6.5 Public Course Browsing
Public users shall be able to:
- View a list of published courses.
- Filter by basic dimensions if implemented later.
- Open course detail pages.
- Start enrollment from the course detail page.

Only published and publicly visible courses shall be returned by public APIs.

### 6.6 Enrollment Submission
Public users shall be able to:
- Open the dynamic form associated with a published course.
- Submit form responses.
- Receive an on-screen success message after submission.

The system shall:
- Validate submission payload against the stored form schema.
- Persist submission data with tenant and course linkage.
- Record submission timestamp and status.

### 6.7 Submission Management
Organization users shall be able to:
- View submissions for their tenant.
- Filter submissions by course.
- Open a submission detail record.

MVP submission statuses:
- submitted
- reviewed
- canceled

### 6.8 Asset Handling
The system shall support S3-backed storage for:
- Organization logos
- Course images
- Future file attachments

Uploads should use pre-signed URLs.

---

## 7. User Flows
The system shall support S3-backed storage for:
- Organization logos
- Course images
- Future file attachments

Uploads should use pre-signed URLs.

---

## 7. User Flows

### 7.1 Organization User Creates and Publishes a Course
1. User signs in.
2. User creates a course in draft state.
3. User defines form fields for the course.
4. User uploads course image if needed.
5. User previews the course and form.
6. User publishes the course.
7. Public catalog reflects the published course.

### 7.2 Public User Enrolls in a Course
1. User opens the tenant-branded public catalog.
2. User selects a published course.
3. User reviews course details.
4. User opens the enrollment form.
5. User submits required information.
6. Backend validates form against schema.
7. Submission is stored.
8. User sees a success page.

### 7.3 Organization User Reviews Submissions
1. User signs in.
2. User navigates to submissions.
3. User filters by course.
4. User opens a submission.
5. User marks status or reviews details.

---

## 8. Information Architecture

### 8.1 Portals
#### Organization Portal
- Sign in
- Dashboard
- Courses
- Course editor
- Form builder
- Submissions
- Tenant settings (basic branding/profile)

#### Public Portal
- Minimize friction.
- Mobile-first responsive layout.
- Tenant-branded public experience.
- Course detail and form should be easy to complete in one session.
- Clear submission success state.

### System
- Log structured errors with request context.
- Include correlation IDs for support and tracing.

---

## 18. Future Extensions

### 18.1 Payments
Reserved design hooks:
- `pricingMode`
- `paymentEnabledFlag`
- `PaymentIntentPlaceholder`
- webhook endpoint namespace

### 18.2 Email Notifications
Email notifications are intentionally out of MVP scope.
Future versions may add:
- applicant confirmation emails
- tenant notification emails
- reminder emails

### 18.3 Workflow Automation
Possible future capabilities:
- internal review workflows
- enrollment approval/rejection
- waitlists
- reminders
- webhook/event integrations

### 18.4 Reporting
Possible future capabilities:
- conversion funnel
- form abandonment analytics
- organization-level dashboards

### 18.5 Integrations
Possible future integrations:
- CRM
- LMS
- SIS
- marketing automation

---

## 19. Risks and Mitigations

### Risk 1: Tenant code resolution becomes inconsistent across web and API layers
- **Why**: tenant-branded routing depends on reliable mapping from `tenantCode` to `tenantId`.
- **Mitigation**: centralize tenant resolution logic and define a canonical tenant directory source.

### Risk 2: Tenant isolation bugs in Lambda logic
- **Why**: pooled multi-tenancy depends on correct authorization code paths.
- **Mitigation**: centralize authorization middleware, add automated tests for cross-tenant access denial.

### Risk 3: Dynamic form schema drift
- **Why**: form definitions may change after submissions exist.
- **Mitigation**: store `formVersion` with each submission and avoid destructive edits.

### Risk 4: Tenant route collision with reserved paths
- **Why**: tenant-based URLs can collide with fixed application routes and internal portal paths.
- **Mitigation**: reserve and block protected slugs at create/update time and add contract tests for reserved paths.

### Risk 5: Premature overengineering in serverless design
- **Why**: single-table and event-driven patterns can become too complex for MVP speed.
- **Mitigation**: optimize for clear access patterns first, not theoretical elegance.

---

## 20. Recommended MVP Decisions

### Recommended Decisions
1. Use **React SPA + S3 + CloudFront**.
2. Use **API Gateway HTTP API + Lambda**.
3. Use **Cognito User Pools** for organization authentication.
4. Use **DynamoDB single-table design** with strictly tenant-scoped query patterns.
5. Use **tenantCode-prefixed public routes** for MVP.
6. Use **manual tenant onboarding** through portal or internal operational flow.
7. Keep **payments stubbed only** in schema and route namespace.
8. Exclude **email notifications** and **CSV export** from MVP.

### Why This Recommendation
Because the product’s early traffic is uncertain and bursty, this stack minimizes fixed cost while preserving scale headroom. Because the app is multi-tenant and form-driven, DynamoDB with carefully designed tenant-scoped access patterns is operationally efficient. Because public access is tenant-branded in MVP, the system can avoid cross-tenant query complexity and use simpler routing plus tenant resolution. Because payment is not in MVP, the spec should reserve extension points without forcing payment complexity into the first release.

---

## 21. Open Questions

1. Should public enrollment require email verification in MVP?
2. Is file upload inside public forms needed in the first release?
3. Do we need draft preview links before publishing?
4. What tenant metadata should appear on the root tenant directory page?
5. How should the system flag courses whose displayed capacity has been exceeded?
6. Which portal flow is allowed to create and edit tenant codes?
7. What is the canonical rule for tenant code uniqueness and format?

## 22. Appendix: MVP Build Sequence

### Phase 1
- Tenant/user auth
- Course CRUD
- Form schema CRUD
- Public catalog and course detail
- Submission endpoint

### Phase 2
- Submission review UI
- Asset upload
- Basic observability dashboards

### Phase 3
- Public projection optimization
- light audit logging
- payment placeholder hardening

### Phase 4
- Cognito-first multi-tenant authentication rollout
- Dedicated auth DynamoDB model and membership checks
- Tenant invite/onboarding baseline and auth observability

### Phase 5
- Tenant profile enrichment (`description`, `isActive`, `homePageContent`)
- Internal-manager authorization and tenant update-only management APIs
- Reserved tenant-code guardrails and tenant home-page API support

### Phase 6
- Cognito login workflow rollout
- Token lifecycle guardrails and observability
- Membership allowed-role model hardening

### Phase 9
- Hosted UI post-login tenant/role context selection contract
- Context validation endpoints and membership-bound authorization
- Dual-intent login model:
  - tenant portal via membership-selected tenant/role
  - internal portal via global internal claim/group
- Internal portal directory capabilities:
  - tenant list
  - list of users with internal-portal access
- Extensible phase for upcoming auth workflow features

### Phase 10
- Internal portal IA refresh with dedicated top-nav model (`Home`, `Tenants`, `Users`, `Logout`)
- Internal tenants management upgrade:
  - list-first tenant view
  - right-drawer display/edit
  - create-tenant capability
- Internal users management upgrade:
  - list-first user view
  - right-drawer user access detail (tenant/roles)
  - add-by-email and remove-internal-access workflows
- API contract and observability hardening for internal portal operations

### Phase 12
- Backend support changes for frontend rollout
- Contract audit and API documentation alignment for frontend consumers
- Public portal payload shaping for tenant/catalog/detail/enrollment UX
- Organization portal contract shaping for list-detail workflows
- Auth/session bootstrap, branding/assets, and observability hardening for shipped UI

---

## 23. Final Recommendation

Build OnlineForms MVP as a pooled multi-tenant serverless SaaS on AWS using React, CloudFront, API Gateway, Lambda, Cognito, DynamoDB, and S3. Keep the first release deliberately narrow: tenant-branded public course catalogs, free course publishing, dynamic enrollment forms, and submission capture. Use tenantCode-prefixed routes so all public and tenant-facing queries stay tenant-scoped in MVP. Preserve future extensibility for payments, email notifications, and custom domains through explicit schema flags and routing abstractions, but do not let those future concerns complicate the MVP delivery path.
