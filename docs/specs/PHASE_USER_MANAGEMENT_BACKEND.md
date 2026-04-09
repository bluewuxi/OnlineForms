# OnlineForms Backend — Tenant Portal User Management Phase

Source: Tenant portal user maintenance requirement. Companion frontend phase:
`OnlineForms-Frontend/docs/specs/PHASE_USER_MANAGEMENT_FRONTEND.md`.

## Goals

- Expose member list and invite list to all org roles via read-scoped endpoints
- Allow `org_admin` to remove members and update member roles
- Protect against unsafe state: last-admin removal, self-removal, invalid role demotion
- Expose invite list via its own endpoint so the frontend can show pending invites
  separately from the member list

## New Endpoints

| Method   | Path                                          | Auth policy        |
|----------|-----------------------------------------------|--------------------|
| `GET`    | `/v1/org/tenants/{tenantId}/members`          | `ORG_MEMBER_READ`  |
| `PATCH`  | `/v1/org/tenants/{tenantId}/members/{userId}` | `ORG_MEMBER_WRITE` |
| `DELETE` | `/v1/org/tenants/{tenantId}/members/{userId}` | `ORG_MEMBER_WRITE` |
| `GET`    | `/v1/org/tenants/{tenantId}/invites`          | `ORG_MEMBER_READ`  |

`ORG_MEMBER_READ` — `org_viewer`, `org_editor`, `org_admin`, `platform_support` (bypass).
`ORG_MEMBER_WRITE` — `org_admin` only.

Full request/response contracts: `docs/reference/api-contracts.md` sections 6.5–6.6.

## Tasks

- [x] BU-01 Implement member management business logic in `authMembers.ts`
  Scope:
  - `listTenantMembers(tenantId)` — queries GSI1 keyed by tenant; returns `TenantMember[]`
  - `removeTenantMember(tenantId, userId, actorUserId)` — atomically deletes user-centric and
    tenant-centric membership records; guards: last-admin block, self-removal block
  - `updateTenantMemberRole(tenantId, userId, newRole, actorUserId)` — atomically updates both
    records; guards: last-admin demotion block
  - `listTenantInvites(tenantId, statusFilter?)` — queries by tenant PK + INVITE# SK prefix;
    optional status filter (`pending` | `accepted`)
  Acceptance:
  - All four functions implemented and exported from `authMembers.ts`
  - Last-admin removal returns `409 CONFLICT`
  - Self-removal returns `409 CONFLICT`
  - Last-admin demotion returns `409 CONFLICT`

- [x] BU-02 Add Lambda handlers and SAM routes for the four endpoints
  Scope:
  - `orgTenantMembersList.ts` — `GET /org/tenants/{tenantId}/members`
  - `orgTenantMembersUpdate.ts` — `PATCH /org/tenants/{tenantId}/members/{userId}`
  - `orgTenantMembersRemove.ts` — `DELETE /org/tenants/{tenantId}/members/{userId}`
  - `orgTenantInvitesList.ts` — `GET /org/tenants/{tenantId}/invites`
  - SAM resources and routes added to `infra/template.yaml`
  - Authorization: handlers call `authorizeOrgAction` with `ORG_MEMBER_READ` or `ORG_MEMBER_WRITE`
  Acceptance:
  - All four routes registered in `infra/template.yaml`
  - `authorizeOrgAction` called on every handler before business logic
  - `tsc --noEmit` passes

- [x] BU-03 Add `ORG_MEMBER_READ` and `ORG_MEMBER_WRITE` policies to `authorization.ts`
  Scope:
  - `ORG_MEMBER_READ`: roles `["org_viewer", "org_editor", "org_admin"]`, `allowPlatformBypass: true`
  - `ORG_MEMBER_WRITE`: roles `["org_admin"]`
  Acceptance:
  - `org_viewer` can call `GET /members` and `GET /invites` — `200`
  - `org_editor` cannot call `DELETE /members/{userId}` — `403`
  - `org_admin` can call all four endpoints

- [x] BU-04 Update `api-contracts.md` with sections 6.5–6.6
  Scope:
  - Section 6.5 (Tenant Invites): add `GET` list endpoint contract, update `POST` response
    example, update valid role list to include `org_viewer`
  - Section 6.6 (Tenant Member Management): full contracts for all four endpoints including
    request/response shapes, error codes (404, 409), and safety guardrail descriptions
  Acceptance:
  - `api-contracts.md` accurately reflects all four endpoints
  - Error codes for each guardrail are documented

## Status Legend

- `[ ]` Not started
- `[~]` In progress
- `[x]` Completed

## Primary References

- `services/api/src/lib/authMembers.ts` — business logic
- `services/api/src/lib/authorization.ts` — policy matrix (`ORG_MEMBER_READ`, `ORG_MEMBER_WRITE`)
- `services/api/src/handlers/orgTenantMembersList.ts`
- `services/api/src/handlers/orgTenantMembersUpdate.ts`
- `services/api/src/handlers/orgTenantMembersRemove.ts`
- `services/api/src/handlers/orgTenantInvitesList.ts`
- `infra/template.yaml` — SAM routes
- `docs/reference/api-contracts.md` — sections 6.5–6.6
- `OnlineForms-Frontend/docs/specs/PHASE_USER_MANAGEMENT_FRONTEND.md` — companion frontend phase
