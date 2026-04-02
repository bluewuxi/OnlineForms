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

- [x] P12-01 Frontend contract audit and API doc alignment
  Issue: https://github.com/bluewuxi/OnlineForms/issues/64
  Scope:
  - Audit existing API payloads against Phase 11 UI needs
  - Normalize documentation for frontend-consumed responses, query params, and errors
  - Close contract gaps before frontend implementation drifts around unstable assumptions

- [x] P12-02 Public portal support payloads and UX metadata
  Issue: https://github.com/bluewuxi/OnlineForms/issues/65
  Scope:
  - Ensure tenant-home, course-list, and course-detail endpoints return the metadata needed by the new public UI
  - Add any missing presentation-safe fields needed for enrollment entry and success states
  - Keep payloads tenant-scoped and stable for cached public rendering

- [x] P12-03 Organization portal list-detail and workflow support contracts
  Issue: https://github.com/bluewuxi/OnlineForms/issues/66
  Scope:
  - Shape course, form-schema, and submission APIs for list-detail UI patterns
  - Add any missing summaries, filters, or workflow status fields needed by the organization portal
  - Preserve backward compatibility where practical

- [x] P12-04 Frontend auth/session bootstrap and shell data contracts
  Issue: https://github.com/bluewuxi/OnlineForms/issues/67
  Scope:
  - Finalize session bootstrap payloads needed after login and context selection
  - Support `internal_admin` context validation when no tenant is selected, while preserving tenant-bound validation for org roles
  - Support frontend initialization for org and internal shells with minimal round trips
  - Clarify auth-expiry and invalid-context error behavior for UI handling

- [x] P12-05 Branding, assets, and observability hardening for frontend rollout
  Issue: https://github.com/bluewuxi/OnlineForms/issues/68
  Scope:
  - Harden branding and asset contracts used by public and org pages
  - Add focused telemetry/error semantics for high-value frontend workflows
  - Update docs/tests/smoke coverage for frontend-facing API behavior

- [x] P12-06 Org branding tenant-description support
  Issue: https://github.com/bluewuxi/OnlineForms/issues/76
  Scope:
  - Add an org-scoped branding read contract for the authenticated tenant
  - Extend org branding updates so tenant admins can edit their current tenant's public description content
  - Keep org-portal branding strictly same-tenant; no cross-tenant mutation path
  - Update tests and backend contract docs/checklists for the richer branding payload

- [x] P12-07 Asset metadata URL resolution for branding and public catalog payloads
  Issue: https://github.com/bluewuxi/OnlineForms/issues/77
  Scope:
  - Resolve tenant branding logo URLs from stored asset metadata rather than hard-coded URL patterns
  - Resolve course image URLs from asset metadata in public payload builders and projection reconciliation
  - Keep asset ids as the canonical references while returning final usable URLs to the frontend
  - Update tests and contract docs/checklists for the resolved asset URL behavior

- [x] P12-08 Private asset delivery via signed read URLs
  Issue: https://github.com/bluewuxi/OnlineForms/issues/78
  Scope:
  - Keep the asset bucket private; do not rely on public S3 object access
  - Return usable signed GET URLs for tenant branding and public course imagery
  - Ensure org asset reads also return previewable signed URLs for management flows
  - Preserve asset ids as canonical references while making read payloads browser-usable
  - Update tests and contract docs/checklists for signed asset delivery

- [x] P12-09 Grant S3 read access to asset URL resolvers
  Issue: https://github.com/bluewuxi/OnlineForms/issues/79
  Scope:
  - Add `S3ReadPolicy` for the private asset bucket to every function that resolves branding or course asset URLs
  - Keep the bucket private and continue using signed read URLs
  - Cover public tenant-home, public catalog, org branding, and org asset preview paths
  - Avoid frontend changes for this infrastructure-only fix

## Status Legend

- `[ ]` Not started
- `[~]` In progress
- `[x]` Completed
