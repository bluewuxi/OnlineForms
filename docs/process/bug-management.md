# Bug Management Process

## Goal

Track each bug from report to verified fix with clear ownership, evidence, and prevention steps.

## Scope

- Applies to backend/API defects, deployment defects, and operational defects.
- Uses GitHub Issues as the source of truth.

## Severity

- `P1` Critical: production outage, data loss/corruption, auth bypass, security exposure.
- `P2` High: key workflow broken for many users, no safe workaround.
- `P3` Medium: partial workflow impact, workaround exists.
- `P4` Low: minor defect, cosmetic issue, or non-blocking paper cut.

## Required Issue Fields

Use the bug issue template and include:

- Observed behavior
- Expected behavior
- Environment (`local`, `stage`, `prod`)
- Reproduction steps
- Evidence (request ID, correlation ID, logs, screenshots)
- Suspected scope (frontend, backend, infra, data)

## Triage SLA

- `P1`: triage immediately, owner assigned same day.
- `P2`: triage within 1 business day.
- `P3`/`P4`: triage within 3 business days.

## Fix Workflow

1. Create or confirm bug issue exists.
2. Reproduce and document root cause.
3. Implement fix with tests.
4. Update runbook/checklist/docs if process gap exists.
5. Link commit/PR to issue (`Fixes #<id>`).
6. Verify in target environment.
7. Close issue with validation notes.

## Definition Of Done

- Root cause documented in issue.
- Regression test added or rationale recorded.
- Deployment validation completed.
- Relevant docs/checklists updated.
- Monitoring/alert gap addressed for `P1`/`P2` when applicable.
