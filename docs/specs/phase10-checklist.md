# OnlineForms Phase 10 Checklist

Source: Internal portal improvement (tenant + internal-user operations)

## Workflow Rule

Implement tasks strictly in order. For each task:
1. Implement feature
2. Write brief change summary in linked GitHub issue
3. Update checklist status
4. Move to next task

Phase 10 is intended for iterative internal-portal capabilities and can be extended.

## Tasks

- [x] P10-01 Internal portal API contract docs update
  Issue: https://github.com/bluewuxi/OnlineForms/issues/54
  Scope:
  - Define and publish API contracts required by internal `Tenants`/`Users` drawers
  - Document add-by-email/remove-access error contracts
  - Align docs with frontend Phase F10 requirements

- [x] P10-02 Internal users access management API (list/detail/add/remove)
  Issue: https://github.com/bluewuxi/OnlineForms/issues/55
  Scope:
  - List internal-access users
  - Add internal access by email (error if user not found)
  - Remove internal access for user
  - Return user detail payload with tenant memberships + roles

- [ ] P10-03 Internal portal contract hardening (authz, audit, observability)
  Issue: https://github.com/bluewuxi/OnlineForms/issues/56
  Scope:
  - Harden authorization boundaries for internal management APIs
  - Add audit/metrics for internal user access mutations
  - Add regression tests for denied/edge scenarios

- [ ] P10-04 Internal tenants management API expansion (list/detail/create/update)
  Issue: https://github.com/bluewuxi/OnlineForms/issues/57
  Scope:
  - Expand tenant APIs for list-first drawer UX
  - Add internal tenant create contract and validation
  - Support tenant detail/edit flow used by internal drawer

## Status Legend

- `[ ]` Not started
- `[~]` In progress
- `[x]` Completed
