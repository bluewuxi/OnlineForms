# OnlineForms Backend — Role Redesign Phase

Source: Role design analysis following security hardening phase (BS-01–BS-10). Full
rationale and agreed design decisions are recorded in `docs/reference/role-design.md`.
Companion frontend phase: `OnlineForms-Frontend/docs/specs/PHASE_ROLE_REDESIGN_FRONTEND.md`.

## Goals

- Rename `platform_admin` to `platform_support` to accurately reflect its support-only scope
- Add `org_viewer` as a read-only org role for auditors and read-only integrations
- Restrict submission and tenant-settings writes to `org_admin` only
- Remove `platform_support` from all internal write actions
- Emit audit events whenever `platform_support` exercises its org-read bypass
- Update invite logic to accept `org_viewer` as a valid invite role

## Scope

`services/api/src/lib/authorization.ts`, `auth.ts`, `authOptions.ts`, `internalAccessUsers.ts`,
`authInvites.ts`, all Lambda handlers, SAM template (`infra/template.yaml`), and all
integration/unit tests. No frontend changes are in this phase (see companion frontend phase).

## Workflow Rule

Implement tasks strictly in order. For each task:
1. Implement feature
2. Write brief change summary in linked GitHub issue
3. Update checklist status
4. Move to next task

## Tasks

- [ ] BR-01 Rename `platform_admin` to `platform_support` across the entire backend
  Issue: https://github.com/bluewuxi/OnlineForms/issues/91
  Scope:
  - Rename the role string `"platform_admin"` → `"platform_support"` everywhere it appears:
    - `AuthRole` union type in `auth.ts`
    - `InternalRole` union type in `internalAccessUsers.ts`
    - `AUTH_ROLE_OPTIONS` array in `authOptions.ts`
    - All policy `roles` arrays in `authorization.ts`
    - Cognito group resource in `infra/template.yaml` (`OnlineFormsPlatformAdminGroup` → `OnlineFormsPlatformSupportGroup`, group name `platform_admin` → `platform_support`)
    - `roleToGroupName` map in `internalAccessUsers.ts`
    - `sessionBootstrap.ts` portal-routing logic (if it references the role string)
    - `orgSessionContextValidate.ts` allowed-roles set
    - All integration and unit tests that reference `"platform_admin"`
  - Update `docs/reference/auth-claims-strategy.md` to reflect the new group name
  - Update `docs/reference/internal-access-group-runbook.md` with migration note:
    existing Cognito users in `platform_admin` group must be moved to `platform_support`
    group before deploying; provide CLI command in the runbook
  Acceptance:
  - No string literal `"platform_admin"` remains anywhere in `services/` or `infra/`
  - Cognito group resource in template is renamed; deployment creates `platform_support` group
  - All existing tests pass with the renamed role
  - Auth flow for a user in the `platform_support` Cognito group behaves identically to the
    previous `platform_admin` flow (session context, portal routing, bypass logic)

- [ ] BR-02 Add `org_viewer` read-only org role
  Issue: https://github.com/bluewuxi/OnlineForms/issues/92
  Scope:
  - Add `"org_viewer"` to the `AuthRole` union type in `auth.ts`
  - Add `org_viewer` entry to `AUTH_ROLE_OPTIONS` in `authOptions.ts`:
    `{ role: "org_viewer", label: "Org Viewer", requiresTenant: true }`
  - Update `authorization.ts` — add `"org_viewer"` to all read-action policy `roles` arrays:
    `ORG_ME_READ`, `ORG_TENANT_CHECK`, `ORG_TENANT_SETTINGS_READ`, `ORG_COURSE_READ`,
    `ORG_FORM_READ`, `ORG_SUBMISSION_READ`, `ORG_ASSET_READ`, `ORG_AUDIT_READ`
  - Do NOT add `org_viewer` to any write-action policy
  - Add `org_viewer` to the allowed-roles set in `orgSessionContextValidate.ts`
  - Add `org_viewer` to the `requiresTenantContext` check alongside `org_admin`/`org_editor`
    in `sessionBootstrap.ts` and any related session-routing logic
  - Add a Cognito group resource `OnlineFormsOrgViewerGroup` in `infra/template.yaml`
    (under `Condition: UseManagedCognito`) with group name `org_viewer`
  Acceptance:
  - A user with `org_viewer` role can call all `GET` org endpoints and receive `200`
  - A user with `org_viewer` role receives `403 FORBIDDEN` on any `POST`/`PATCH`/`PUT`
    org endpoint (`courses`, `form-schema`, `submissions`, `branding`, `assets`, `invites`)
  - `org_viewer` appears in the session context list for a tenant member with that role
  - Unit test covers `authorizeOrgAction` granting read and denying write for `org_viewer`

- [ ] BR-03 Restrict `ORG_SUBMISSION_WRITE` and `ORG_TENANT_SETTINGS_WRITE` to `org_admin` only
  Issue: https://github.com/bluewuxi/OnlineForms/issues/93
  Scope:
  - In `authorization.ts`, change the `roles` arrays for:
    - `ORG_SUBMISSION_WRITE`: remove `"org_editor"` → `{ roles: ["org_admin"] }`
    - `ORG_TENANT_SETTINGS_WRITE`: remove `"org_editor"` → `{ roles: ["org_admin"] }`
  - No handler changes required — `authorizeOrgAction` enforces the policy centrally
  - Verify the two affected handlers: `orgSubmissionsUpdate.ts` and `orgTenantBrandingUpdate.ts`
    still call `authorizeOrgAction` with the correct action keys (no inline role checks)
  - Update integration tests for both handlers:
    - Add test: `org_editor` calling `PATCH /org/submissions/{submissionId}` receives `403`
    - Add test: `org_editor` calling `PATCH /org/branding` receives `403`
    - Confirm existing `org_admin` tests for the same routes continue to return `200`/`204`
  Acceptance:
  - `org_editor` receives `403 FORBIDDEN` on `PATCH /org/submissions/{submissionId}`
  - `org_editor` receives `403 FORBIDDEN` on `PATCH /org/branding`
  - `org_admin` continues to succeed on both routes
  - All existing tests pass; new tests cover the `org_editor` rejection path

- [ ] BR-04 Remove `platform_support` from internal write actions
  Issue: https://github.com/bluewuxi/OnlineForms/issues/94
  Scope:
  - In `authorization.ts`, update the four internal action policies:
    - `INTERNAL_TENANT_READ`: keep `"platform_support"` — `{ roles: ["internal_admin", "platform_support"], allowPlatformBypass: true }`
    - `INTERNAL_TENANT_WRITE`: remove `"platform_support"` — `{ roles: ["internal_admin"] }`
    - `INTERNAL_USER_READ`: keep `"platform_support"` — `{ roles: ["internal_admin", "platform_support"], allowPlatformBypass: true }`
    - `INTERNAL_USER_WRITE`: remove `"platform_support"` — `{ roles: ["internal_admin"] }`
  - Add integration tests:
    - `platform_support` calling `POST /internal/tenants` receives `403`
    - `platform_support` calling `POST /internal/users` receives `403`
    - `platform_support` calling `GET /internal/tenants` receives `200`
    - `platform_support` calling `GET /internal/users` receives `200`
    - `internal_admin` continues to succeed on all four routes
  Acceptance:
  - `platform_support` is rejected with `403` on all internal write endpoints
  - `platform_support` continues to receive `200` on all internal read endpoints
  - `internal_admin` is unaffected
  - All tests pass

- [ ] BR-05 Emit audit events for `platform_support` org-read bypass
  Issue: https://github.com/bluewuxi/OnlineForms/issues/95
  Scope:
  - Currently when `platform_support` bypasses tenant membership to read org data, no audit
    event is emitted. This must be made visible in the audit trail.
  - In `authorization.ts` (or a wrapper called by `authorizeOrgAction`), detect when:
    - The authenticated role is `platform_support`, AND
    - The action has `allowPlatformBypass: true`, AND
    - The user is not a member of the tenant (i.e. the bypass is actually being exercised)
  - On each such bypass, write an audit event:
    ```
    action:       "platform_support.org_read_bypass"
    actorUserId:  <the platform_support user's ID>
    tenantId:     <the tenant being accessed>
    resourceType: derived from the action key (e.g. "course", "submission")
    resourceId:   the resource ID if available, otherwise null
    correlationId: from correlation context
    ```
  - The audit event must be written asynchronously — it must not block the main response
    or cause the request to fail if the audit write itself fails (log the error, continue)
  - Add a CloudWatch metric `PlatformSupportBypassCount` (namespace `OnlineForms/Auth`) so
    bypass frequency can be alarmed on
  Acceptance:
  - Every `platform_support` org-read bypass produces an audit entry in `OnlineFormsMain`
  - The audit entry appears in `GET /v1/org/audit` for the affected tenant
  - A failure to write the audit event does not fail the original request
  - `PlatformSupportBypassCount` metric is emitted per bypass event
  - Unit test verifies the audit write is triggered on bypass and skipped for normal members

- [ ] BR-06 Update invite flow to accept `org_viewer` as a valid invite role
  Issue: https://github.com/bluewuxi/OnlineForms/issues/96
  Scope:
  - In `authInvites.ts`, add `"org_viewer"` to the list of roles that are valid invite
    targets (currently only `"org_admin"` and `"org_editor"` are accepted)
  - Validate that the invite creation handler (`orgTenantInviteCreate.ts`) rejects any
    role value that is not in `["org_viewer", "org_editor", "org_admin"]` with a clear
    `422 VALIDATION_ERROR` response
  - When an `org_viewer` invite is accepted, the resulting membership record must have
    `role: "org_viewer"` and `allowedRoles: ["org_viewer"]`
  - Add integration tests:
    - `org_admin` can create an invite for `org_viewer` role → `201`
    - Accepting an `org_viewer` invite creates a membership with correct role
    - `org_admin` cannot create an invite with role `"internal_admin"` → `422`
    - `org_admin` cannot create an invite with role `"platform_support"` → `422`
  Acceptance:
  - `POST /org/tenants/{tenantId}/invites` with `role: "org_viewer"` returns `201`
  - Accepted invite creates an `org_viewer` membership record
  - Attempting to invite with `platform_support` or `internal_admin` returns `422`
  - All existing invite tests continue to pass

## Status Legend

- `[ ]` Not started
- `[~]` In progress
- `[x]` Completed

## Primary References

- `docs/reference/role-design.md` — full role analysis and agreed design
- `services/api/src/lib/authorization.ts` — central policy matrix
- `services/api/src/lib/auth.ts` — `AuthRole` type and token resolution
- `services/api/src/lib/authOptions.ts` — role metadata for UI and invite validation
- `services/api/src/lib/internalAccessUsers.ts` — internal role ↔ Cognito group mapping
- `services/api/src/lib/authInvites.ts` — invite creation and acceptance logic
- `infra/template.yaml` — Cognito group resources
- `OnlineForms-Frontend/docs/specs/PHASE_ROLE_REDESIGN_FRONTEND.md` — companion frontend phase
