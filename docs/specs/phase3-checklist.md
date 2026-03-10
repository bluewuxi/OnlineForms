# OnlineForms Phase 3 Checklist

Source: `docs/specs/onlineforms_mvp_spec.md` Phase 3

## Workflow Rule

Implement tasks strictly in order. For each task:
1. Implement feature
2. Write brief change summary in linked GitHub issue
3. Update checklist status
4. Move to next task

## Tasks

- [x] P3-01 Public projection data model hardening  
  Issue: https://github.com/bluewuxi/OnlineForms/issues/17
  Scope:
  - Define/implement stable projection item schema for public catalog/detail reads
  - Add projection versioning/shape guards to prevent breaking public responses
  - Ensure tenantCode-scoped access patterns remain primary read path

- [x] P3-02 Projection synchronization reliability  
  Issue: https://github.com/bluewuxi/OnlineForms/issues/18
  Scope:
  - Make course/form/asset mutations consistently update projection records
  - Add idempotent upsert behavior for projection writes
  - Add fallback reconciliation script for projection drift repair

- [x] P3-03 Public query performance optimization  
  Issue: https://github.com/bluewuxi/OnlineForms/issues/19
  Scope:
  - Optimize public list/detail query patterns and indexes for low-latency reads
  - Add pagination/sort behavior guarantees under large catalogs
  - Add measurable latency/error budget targets for public endpoints

- [x] P3-04 Light audit logging foundation  
  Issue: https://github.com/bluewuxi/OnlineForms/issues/20
  Scope:
  - Add audit event model for key org actions (course publish/archive, form updates, submission status updates)
  - Persist minimal immutable audit trail with actor/time/tenant/resource/action
  - Include correlation/request IDs in audit records for traceability

- [x] P3-05 Audit read API (org)  
  Issue: https://github.com/bluewuxi/OnlineForms/issues/21
  Scope:
  - Implement tenant-scoped audit list endpoint with basic filters
  - Add pagination and time-range filtering
  - Enforce strict tenant isolation and redaction rules

- [x] P3-06 Payment placeholder contract hardening  
  Issue: https://github.com/bluewuxi/OnlineForms/issues/22
  Scope:
  - Tighten pricing/payment-related schema constraints while keeping payments disabled
  - Enforce explicit rules around `pricingMode`, `paymentEnabledFlag`, and publish guards
  - Align API/OpenAPI docs to clearly distinguish placeholder vs active payment paths

- [x] P3-07 Payments namespace stub robustness  
  Issue: https://github.com/bluewuxi/OnlineForms/issues/23
  Scope:
  - Add reserved `/v1/payments/*` stub routes with clear non-active responses
  - Standardize error codes/messages for unsupported payment operations
  - Add internal feature-flag/guard points for future activation

- [x] P3-08 Phase 3 validation pack (tests + smoke + ops notes)  
  Issue: https://github.com/bluewuxi/OnlineForms/issues/24
  Scope:
  - Add tests for projection sync, audit logging, and payment placeholder guards
  - Extend smoke collection for new public/audit/payment-stub scenarios
  - Document operational checks for projection drift and audit trail health

## Status Legend

- `[ ]` Not started
- `[~]` In progress
- `[x]` Completed
