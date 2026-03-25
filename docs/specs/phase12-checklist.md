# OnlineForms Phase 12 Checklist

Source: Backend support plan for frontend UI rollout

## Workflow Rule

Implement tasks strictly in order. For each task:
1. Implement feature
2. Write brief change summary in linked GitHub issue
3. Update checklist status
4. Move to next task

Phase 12 is intended for backend contract and support changes required to ship the Phase 11 UI cleanly.

## Tasks

- [ ] P12-01 Frontend contract audit and API doc alignment
  Issue: https://github.com/bluewuxi/OnlineForms/issues/64
  Scope:
  - Audit existing API payloads against Phase 11 UI needs
  - Normalize documentation for frontend-consumed responses, query params, and errors
  - Close contract gaps before frontend implementation drifts around unstable assumptions

- [ ] P12-02 Public portal support payloads and UX metadata
  Issue: https://github.com/bluewuxi/OnlineForms/issues/65
  Scope:
  - Ensure tenant-home, course-list, and course-detail endpoints return the metadata needed by the new public UI
  - Add any missing presentation-safe fields needed for enrollment entry and success states
  - Keep payloads tenant-scoped and stable for cached public rendering

- [ ] P12-03 Organization portal list-detail and workflow support contracts
  Issue: https://github.com/bluewuxi/OnlineForms/issues/66
  Scope:
  - Shape course, form-schema, and submission APIs for list-detail UI patterns
  - Add any missing summaries, filters, or workflow status fields needed by the organization portal
  - Preserve backward compatibility where practical

- [ ] P12-04 Frontend auth/session bootstrap and shell data contracts
  Issue: https://github.com/bluewuxi/OnlineForms/issues/67
  Scope:
  - Finalize session bootstrap payloads needed after login and context selection
  - Support frontend initialization for org and internal shells with minimal round trips
  - Clarify auth-expiry and invalid-context error behavior for UI handling

- [ ] P12-05 Branding, assets, and observability hardening for frontend rollout
  Issue: https://github.com/bluewuxi/OnlineForms/issues/68
  Scope:
  - Harden branding and asset contracts used by public and org pages
  - Add focused telemetry/error semantics for high-value frontend workflows
  - Update docs/tests/smoke coverage for frontend-facing API behavior

## Status Legend

- `[ ]` Not started
- `[~]` In progress
- `[x]` Completed
