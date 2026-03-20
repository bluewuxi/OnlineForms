# Phase 6 Auth Role-List Migration

Last updated: 2026-03-20

## Goal

Introduce `allowedRoles` on tenant membership records without breaking existing single-role records.

## Target Records

Membership entities in `OnlineFormsAuth`:

- `PK=USER#{userId}`, `SK=MEMBERSHIP#{tenantId}`
- `PK=TENANT#{tenantId}`, `SK=MEMBER#{userId}`

## New Attribute

- `allowedRoles`: array of role strings (for example `["org_admin", "org_editor"]`)

## Backward Compatibility Rule

- If `allowedRoles` is missing or empty, backend treats membership as single-role:
  - effective allowed list = `[role]`

## Migration Steps

1. Deploy backend code that supports both legacy and new membership shapes.
2. Backfill existing membership records:
   - if `allowedRoles` missing, set `allowedRoles=[role]`
3. Validate sampled tenants:
   - ensure active memberships still authorize expected roles
   - ensure mismatched roles are denied
4. Roll forward invite-accept path to write `allowedRoles` on new records.

## Rollback

- Keep compatibility logic enabled.
- If issues occur, remove `allowedRoles` writes from invite acceptance while retaining fallback reads.
