# OnlineForms Phase 4 Checklist

Source: `docs/specs/onlineforms_mvp_spec.md` Phase 4

## Workflow Rule

Implement tasks strictly in order. For each task:
1. Implement feature
2. Write brief change summary in linked GitHub issue
3. Update checklist status
4. Move to next task

## Tasks

- [x] P4-01 Cognito auth mode hardening and runtime toggle
  Issue: https://github.com/bluewuxi/OnlineForms/issues/26
  Scope:
  - Switch production/stage deployment to `AUTH_MODE=cognito`
  - Keep `mock` mode only for local/test environments
  - Validate JWT verifier config (`COGNITO_USER_POOL_ID`, `COGNITO_CLIENT_ID`, `COGNITO_TOKEN_USE`)

- [x] P4-02 Dedicated auth table foundation (`OnlineFormsAuth`)
  Issue: https://github.com/bluewuxi/OnlineForms/issues/27
  Scope:
  - Create separate DynamoDB table for auth entities
  - Define single-table auth keys and entity conventions
  - Keep business data isolated in `OnlineFormsMain`

- [x] P4-03 Multi-tenant membership model + tenant context resolution
  Issue: https://github.com/bluewuxi/OnlineForms/issues/28
  Scope:
  - Add `USER -> TENANT membership` records in auth table
  - Resolve active tenant context per request (`x-tenant-id` or route context)
  - Enforce tenant membership checks in protected APIs

- [x] P4-04 Role and authorization policy consolidation
  Issue: https://github.com/bluewuxi/OnlineForms/issues/29
  Scope:
  - Centralize role policy for `org_admin`, `org_editor`, `platform_admin`
  - Enforce cross-tenant restrictions with explicit deny behavior
  - Ensure platform admin bypass is limited to approved endpoints

- [ ] P4-05 Tenant invite/onboarding auth flow baseline
  Issue: https://github.com/bluewuxi/OnlineForms/issues/30
  Scope:
  - Add invite entity and acceptance flow for tenant membership
  - Map invite acceptance to Cognito user identity (`sub`)
  - Persist membership activation metadata and audit fields

- [ ] P4-06 Token claim strategy for multi-tenant SaaS
  Issue: https://github.com/bluewuxi/OnlineForms/issues/31
  Scope:
  - Define minimal stable custom claims (default tenant/platform role)
  - Avoid per-tenant claim explosion in JWT
  - Document claim-to-authorization decision path

- [ ] P4-07 Auth observability and security controls
  Issue: https://github.com/bluewuxi/OnlineForms/issues/32
  Scope:
  - Add auth failure metrics/alerts (invalid token, tenant mismatch, role denied)
  - Add structured audit events for authentication and membership decisions
  - Document incident/debug runbook for auth-related production issues

- [ ] P4-08 Phase 4 validation pack (tests + smoke + docs)
  Issue: https://github.com/bluewuxi/OnlineForms/issues/33
  Scope:
  - Add tests for membership checks and cross-tenant denial
  - Add Cognito-mode smoke requests and troubleshooting notes
  - Update API docs and user guide for Cognito auth usage

## Status Legend

- `[ ]` Not started
- `[~]` In progress
- `[x]` Completed


