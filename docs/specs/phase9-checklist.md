# OnlineForms Phase 9 Checklist

Source: Phase 9 (post-login tenant/role context workflow)

## Workflow Rule

Implement tasks strictly in order. For each task:
1. Implement feature
2. Write brief change summary in linked GitHub issue
3. Update checklist status
4. Move to next task

Phase 9 is intentionally extensible and will absorb upcoming auth/workflow features.

## Tasks

- [x] P9-01 Post-login tenant/role context endpoints and validation flow
  Issue: https://github.com/bluewuxi/OnlineForms/issues/50
  Scope:
  - Add `GET /v1/org/session-contexts` and `POST /v1/org/session-context`
  - Validate selected tenant/role against active membership + allowed roles
  - Keep Cognito auth contract compatibility and secure role-override guards

- [ ] P9-02 Auth context observability and contract hardening
  Issue: https://github.com/bluewuxi/OnlineForms/issues/49
  Scope:
  - Expand telemetry and failure diagnostics for context selection flow
  - Harden edge-case contracts and regression tests
  - Update rollout runbook and troubleshooting notes

- [ ] P9-03 Extensible auth workflow backlog slot
  Issue: https://github.com/bluewuxi/OnlineForms/issues/48
  Scope:
  - Carry incremental auth workflow features as requirements evolve
  - Capture scope per enhancement before implementation
  - Deliver with tests/docs/checklist updates

- [x] P9-04 Dual-intent auth contract (tenant portal vs internal portal)
  Issue: https://github.com/bluewuxi/OnlineForms/issues/51
  Scope:
  - Separate tenant-portal and internal-portal access decisions
  - Keep tenant access membership-driven from `OnlineFormsAuth`
  - Keep internal access as global `internal_admin` claim/group capability
  - Harden route-policy boundaries and add focused regression tests

- [ ] P9-05 Internal-access group mapping and rollout runbook
  Issue: https://github.com/bluewuxi/OnlineForms/issues/52
  Scope:
  - Define canonical Cognito group/claim mapping for internal portal access
  - Add migration guidance for existing users lacking internal claim/group
  - Add troubleshooting guidance for mixed internal + tenant users

- [ ] P9-06 Internal portal directories (tenants + internal-access users)
  Issue: https://github.com/bluewuxi/OnlineForms/issues/53
  Scope:
  - Provide backend directory support for internal portal:
    - tenant list for internal management
    - users with internal-portal access capability
  - Finalize query/pagination contract for internal directory APIs
  - Add tests and documentation updates

## Status Legend

- `[ ]` Not started
- `[~]` In progress
- `[x]` Completed
