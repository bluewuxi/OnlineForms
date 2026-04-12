# Changelog

All notable changes to this project will be documented in this file.

## [0.1.2.0] - 2026-04-12

### Fixed
- Fixed `authenticateRequest` in `auth.ts` to evaluate the `x-role` request header before attempting JWT role claim extraction. Org users have no role embedded in their JWT (role is selected at session time); the previous order caused a `FORBIDDEN` error for all org role requests when no JWT role claim was present.
- Migrated seed tenant ID `001` (Studio School of Technology & Design) to the standard `ten_853111bd16a1` format across `OnlineFormsMain` and `OnlineFormsAuth` DynamoDB tables (18 main items, 4 auth tenant items, 2 user membership items, and the `TENANTCODE#std-school` map entry).

### Changed
- Updated `docs/reference/environment-data.md` with corrected tenant ID and added `rickysbit-nz@yahoo.com` user entry.
- Updated `docs/reference/auth-claims-strategy.md` to document that `x-role` header is evaluated before JWT claims in the authorization decision path.
- Updated `docs/guides/COGNITO_AUTH_TROUBLESHOOTING.md` to reflect correct role resolution order and valid role names.

## [0.1.1.0] - 2026-03-26

### Added
- Added internal user lifecycle endpoints for activation, deactivation, password reset, role mutation, logout tracking, and activity timeline reads.
- Added a dedicated internal activity store and infrastructure wiring for canonical internal control-plane audit events.

### Changed
- Expanded the internal access service to support full internal-user management workflows and last-admin safety guardrails.
- Updated internal auth/session validation to record internal login activity.
- Updated API reference and UI design docs to match the shipped internal control-plane contract.

### Fixed
- Fixed last-admin protection so only enabled privileged users count toward the self-lockout guardrail.
- Removed the duplicate internal user list path and consolidated the canonical handler/test surface.
