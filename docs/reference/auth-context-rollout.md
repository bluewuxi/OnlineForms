# Auth Context Rollout Notes (P9-02)

## Purpose

Operational notes for post-login tenant/role context selection flow.

## Metrics (CloudWatch Namespace `OnlineForms/Auth`)

- `SessionContextsEmptyCount`
  - Emitted when `GET /v1/org/session-contexts` returns zero active contexts.
- `SessionContextValidationSuccessCount`
  - Emitted on successful `POST /v1/org/session-context`.
- `SessionContextValidationDeniedCount`
  - Emitted when context validation is rejected with `403`.
- `SessionContextValidationInvalidCount`
  - Emitted when context validation request fails with `400`.
- `InternalAccessGrantCount`
  - Emitted when internal access is granted through internal users API.
- `InternalAccessRevokeCount`
  - Emitted when internal access is removed through internal users API.

## Audit Events (`type=auth_audit`)

- `auth_session_contexts_listed`
- `auth_session_context_validation_succeeded`
- `auth_session_context_validation_denied`
- `auth_session_context_validation_invalid`
- `auth_internal_access_granted`
- `auth_internal_access_revoked`
- `auth_internal_access_mutation_failed`

## Troubleshooting

1. `SessionContextsEmptyCount` increases:
   - Verify user has `AUTH_MEMBERSHIP` rows in `OnlineFormsAuth`:
     - `PK=USER#{sub}`
     - `SK=MEMBERSHIP#{tenantId}`
   - Ensure membership `status=active`.
2. Validation denied spikes:
   - Check whether selected role is included in membership `allowedRoles`.
   - Confirm tenant selected by frontend matches membership tenant.
3. Validation invalid spikes:
   - Confirm frontend sends JSON payload with both `tenantId` and `role`.
   - Validate role is one of `org_admin|org_editor|internal_admin|platform_admin`.
