# OnlineForms Phase 6 Checklist

Source: `docs/specs/onlineforms_mvp_spec.md` Phase 6 (Cognito login workflow rollout)

## Workflow Rule

Implement tasks strictly in order. For each task:
1. Implement feature
2. Write brief change summary in linked GitHub issue
3. Update checklist status
4. Move to next task

## Tasks

- [x] P6-01 Cognito claim contract and environment hardening
  Issue: https://github.com/bluewuxi/OnlineForms/issues/43
  Scope:
  - Finalize required token-claim contract for org and internal roles
  - Harden stage/prod auth-mode configuration guardrails
  - Document runtime failure cases and operator expectations

- [x] P6-02 Cognito token refresh integration runbook and app-client settings
  Issue: https://github.com/bluewuxi/OnlineForms/issues/45
  Scope:
  - Define Cognito app-client settings required for refresh-token sessions
  - Document deployment prerequisites for token lifecycle settings
  - Add rollout validation and rollback notes

- [x] P6-03 Auth error taxonomy and observability for token lifecycle
  Issue: https://github.com/bluewuxi/OnlineForms/issues/44
  Scope:
  - Standardize auth error semantics for token-expiry/invalid-token branches
  - Expand auth metrics/audit events for refresh troubleshooting
  - Add tests for token lifecycle error behavior

- [x] P6-04 Cognito auth smoke pack and CI deployment gates
  Issue: https://github.com/bluewuxi/OnlineForms/issues/46
  Scope:
  - Extend smoke checks for Cognito-authenticated org/internal flows
  - Add CI/deploy assertions for required auth deployment parameters
  - Update runbooks/checklists for production rollout

- [ ] P6-05 Auth-table allowed-role list model and enforcement
  Issue: https://github.com/bluewuxi/OnlineForms/issues/47
  Scope:
  - Extend auth-table schema to support per-user tenant-scoped allowed role lists
  - Define token role vs allowed-role-list validation and effective-role resolution
  - Enforce allowed-role checks in auth middleware and add regression tests
  - Provide migration/backward-compatibility path for existing single-role records

## Status Legend

- `[ ]` Not started
- `[~]` In progress
- `[x]` Completed
