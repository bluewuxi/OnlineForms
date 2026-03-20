# OnlineForms Phase 5 Checklist

Source: `docs/specs/onlineforms_mvp_spec.md` Phase 5

## Workflow Rule

Implement tasks strictly in order. For each task:
1. Implement feature
2. Write brief change summary in linked GitHub issue
3. Update checklist status
4. Move to next task

## Tasks

- [x] P5-01 Tenant entity enrichment fields and validation
  Issue: https://github.com/bluewuxi/OnlineForms/issues/35
  Scope:
  - Extend tenant entity with `description`, `isActive`, and optional `homePageContent`
  - Update validation and persistence mapping
  - Preserve compatibility for existing tenant records

- [x] P5-02 Reserved tenant-code and route-safety guardrails
  Issue: https://github.com/bluewuxi/OnlineForms/issues/36
  Scope:
  - Block reserved tenant codes that conflict with fixed routes
  - Enforce checks on create/update flows
  - Return explicit validation errors and add tests

- [x] P5-03 Internal management role and tenant update-only APIs
  Issue: https://github.com/bluewuxi/OnlineForms/issues/37
  Scope:
  - Add `internal_manager` role support in auth policy
  - Add internal APIs for tenant profile update-only workflows
  - Keep tenant create/delete out of scope for these APIs

- [x] P5-04 Tenant home-page API contract and published course linkage
  Issue: https://github.com/bluewuxi/OnlineForms/issues/38
  Scope:
  - Add tenant home payload endpoint keyed by `tenantCode`
  - Return display/profile fields for tenant landing page
  - Include published course-list link metadata

- [x] P5-05 Phase 5 migration, seed, and verification pack
  Issue: https://github.com/bluewuxi/OnlineForms/issues/39
  Scope:
  - Add migration/backfill strategy for newly added tenant fields
  - Add seed/update scripts and runbook notes
  - Add tests/smoke checks for role and route-safety changes

- [x] P5-06 Public tenant directory endpoint for root home cards
  Issue: https://github.com/bluewuxi/OnlineForms/issues/40
  Scope:
  - Add and document `GET /v1/public/tenants` for frontend root-home tenant cards
  - Return active tenant directory items (`tenantCode`, `displayName`, `description`, `isActive`)
  - Wire SAM route, update OpenAPI/docs, and add tests

- [x] P5-07 Internal-admin auth context rules and role directory contract
  Issue: https://github.com/bluewuxi/OnlineForms/issues/41
  Scope:
  - Define internal-admin role semantics for management flows
  - Allow tenant context to be optional for `internal_admin` role on internal endpoints
  - Keep tenant required for non-internal-admin org routes and update auth docs/tests

- [x] P5-08 Cognito single-tenant JWT auth context for org sessions
  Issue: https://github.com/bluewuxi/OnlineForms/issues/42
  Scope:
  - Require tenant claim for org roles in `AUTH_MODE=cognito` (no default-tenant fallback)
  - Resolve org tenant context from JWT tenant claim with membership enforcement
  - Keep `internal_admin` tenant-optional behavior for internal routes only
  - Update auth contracts/docs/tests for single-tenant-per-login semantics

## Status Legend

- `[ ]` Not started
- `[~]` In progress
- `[x]` Completed
