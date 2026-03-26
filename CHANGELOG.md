# Changelog

All notable changes to this project will be documented in this file.

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
