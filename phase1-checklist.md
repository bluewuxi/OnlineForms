# OnlineForms Phase 1 Checklist

Source: `onlineforms_mvp_spec.md` Phase 1

## Workflow Rule

Implement tasks strictly in order. For each task:
1. Implement feature
2. Write brief change summary in linked GitHub issue
3. Update checklist status
4. Move to next task

## Tasks

- [x] P1-01 Backend project bootstrap and runtime scaffolding  
  Issue: https://github.com/bluewuxi/OnlineForms/issues/1
  Scope:
  - Initialize API service structure (`infra`, `services`, `shared`)
  - Configure environment and deployment baseline
  - Add basic health endpoint and request correlation plumbing

- [x] P1-02 Authentication and tenant context middleware  
  Issue: https://github.com/bluewuxi/OnlineForms/issues/2
  Scope:
  - Cognito JWT verification middleware
  - Extract `tenantId` and `role` from claims
  - Enforce tenant guard for protected endpoints

- [x] P1-03 Organization Course CRUD APIs  
  Issue: https://github.com/bluewuxi/OnlineForms/issues/3
  Scope:
  - Implement `/v1/org/courses` create/list/get/update
  - Implement publish/archive actions
  - Apply DynamoDB access patterns and validations

- [x] P1-04 Form schema CRUD and versioning  
  Issue: https://github.com/bluewuxi/OnlineForms/issues/4
  Scope:
  - Implement `/v1/org/courses/{courseId}/form-schema` upsert/get
  - Implement immutable version retrieval endpoint
  - Add schema field validation rules

- [ ] P1-05 Public catalog and course detail APIs  
  Issue: https://github.com/bluewuxi/OnlineForms/issues/5
  Scope:
  - Implement `/v1/public/{tenantCode}/courses` and `/{courseId}`
  - Tenant code resolution and published-only filter
  - Public projection/read model usage

- [ ] P1-06 Public enrollment submission API  
  Issue: https://github.com/bluewuxi/OnlineForms/issues/6
  Scope:
  - Implement `/v1/public/{tenantCode}/courses/{courseId}/enrollments`
  - Validate answers against stored form schema version
  - Persist submission + idempotency key behavior

- [ ] P1-07 Phase 1 automated tests  
  Issue: https://github.com/bluewuxi/OnlineForms/issues/7
  Scope:
  - Unit tests for validators and auth/tenant guards
  - Integration tests for core happy paths
  - Cross-tenant access denial tests

- [ ] P1-08 Seed data and API smoke collection  
  Issue: https://github.com/bluewuxi/OnlineForms/issues/8
  Scope:
  - Seed script for sample tenant/course/form
  - Minimal API request collection for local smoke testing

## Status Legend

- `[ ]` Not started
- `[~]` In progress
- `[x]` Completed
