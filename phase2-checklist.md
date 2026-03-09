# OnlineForms Phase 2 Checklist

Source: `onlineforms_mvp_spec.md` Phase 2

## Workflow Rule

Implement tasks strictly in order. For each task:
1. Implement feature
2. Write brief change summary in linked GitHub issue
3. Update checklist status
4. Move to next task

## Tasks

- [ ] P2-01 Submission query APIs (org)  
  Issue: https://github.com/bluewuxi/OnlineForms/issues/9
  Scope:
  - Implement `GET /v1/org/submissions` with tenant-scoped filtering (`courseId`, `status`, date range)
  - Implement pagination (`limit`, `cursor`)
  - Align response envelope with `openapi.yaml`

- [ ] P2-02 Submission detail + status update APIs  
  Issue: https://github.com/bluewuxi/OnlineForms/issues/10
  Scope:
  - Implement `GET /v1/org/submissions/{submissionId}`
  - Implement `PATCH /v1/org/submissions/{submissionId}` for status transitions (`submitted -> reviewed|canceled`)
  - Enforce transition guards and tenant isolation

- [ ] P2-03 Submission review UI backend contract hardening  
  Issue: https://github.com/bluewuxi/OnlineForms/issues/11
  Scope:
  - Add response fields needed by reviewer screens (applicant summary + timestamps + course context)
  - Add reviewer-friendly default sorting (`submittedAt desc`)
  - Add clear error semantics for invalid/stale status updates

- [ ] P2-04 Asset upload ticket API  
  Issue: https://github.com/bluewuxi/OnlineForms/issues/12
  Scope:
  - Implement `POST /v1/org/assets/upload-ticket`
  - Validate file constraints (type/size/purpose)
  - Return pre-signed S3 upload URL + metadata envelope

- [ ] P2-05 Asset metadata persistence and retrieval  
  Issue: https://github.com/bluewuxi/OnlineForms/issues/13
  Scope:
  - Persist asset metadata records in DynamoDB
  - Implement `GET /v1/org/assets/{assetId}` (optional list endpoint if needed)
  - Enforce tenant ownership guard on asset reads

- [ ] P2-06 Course/tenant image binding flow  
  Issue: https://github.com/bluewuxi/OnlineForms/issues/14
  Scope:
  - Support binding uploaded asset IDs to course image and tenant branding fields
  - Validate asset status before binding
  - Keep public projection image data in sync

- [ ] P2-07 Observability baseline dashboards + alarms  
  Issue: https://github.com/bluewuxi/OnlineForms/issues/15
  Scope:
  - Add CloudWatch dashboard for API/Lambda/DynamoDB health metrics
  - Add minimal alarms for error spikes and throttling
  - Document basic operational thresholds/runbook notes

- [ ] P2-08 Phase 2 tests + smoke pack  
  Issue: https://github.com/bluewuxi/OnlineForms/issues/16
  Scope:
  - Add unit/integration coverage for submissions and assets
  - Add cross-tenant denial tests for new endpoints
  - Add smoke requests for review + asset upload flows

## Status Legend

- `[ ]` Not started
- `[~]` In progress
- `[x]` Completed
