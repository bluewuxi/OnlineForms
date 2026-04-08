# OnlineForms — Role Design Reference

This document records the rationale behind the current role system, the security
improvements applied during the security hardening phase, and the agreed role
redesign that supersedes the original flat two-role model.

---

## 1. Security Hardening Phase Summary (BS-01 – BS-10)

The security hardening phase (see `docs/specs/PHASE_SECURITY_BACKEND.md`) addressed
ten categories of risk across the public-facing API, internal management surface, and
AWS infrastructure. Key outcomes relevant to role and access design:

| Task | Outcome |
|---|---|
| BS-01 Rate limiting | Public enrollment endpoint now enforces 10 req/IP/hour via DynamoDB atomic counter |
| BS-02 CAPTCHA | Cloudflare Turnstile token verified server-side before any submission processing |
| BS-03 Honeypot | Server-side honeypot returns `200 OK` with fake payload to avoid alerting bots |
| BS-04 Input validation | Enrollment answers validated against form schema before DynamoDB write |
| BS-05 CORS | Org/internal routes moved to a dedicated API Gateway (`OnlineFormsOrgHttpApi`) with restricted `OrgCorsAllowedOrigins` — `localhost` is excluded from authenticated routes |
| BS-06 S3 upload | Presigned PUT replaced with presigned POST including `content-length-range` (1–5 MB) and MIME-type conditions enforced at S3 |
| BS-07 Tenant enumeration | Inactive and non-existent tenants now return identical `404` responses |
| BS-08 Error sanitisation | Centralised error serialiser strips stack traces and internal names in production |
| BS-09 Audit trail | All write operations across org and internal handlers verified to produce audit entries |
| BS-10 Dependency scanning | `npm audit --audit-level=high` added to CI; Dependabot enabled |

---

## 2. Role System — Original Design

### 2.1 Role inventory (pre-redesign)

| Role | Type | Tenant required | Portal |
|---|---|---|---|
| `org_admin` | Org-level | Yes | Org |
| `org_editor` | Org-level | Yes | Org |
| `platform_admin` | Platform-level | Yes | Org (support impersonation) |
| `internal_admin` | Platform-level | No | Internal |

### 2.2 Problems identified

**Org roles:**
- `org_editor` was a write role in all but name — it could mutate submission statuses,
  overwrite tenant branding, and upload public-facing assets, all actions that belong
  to an operator rather than a content author.
- `org_admin` had exactly one extra permission (`ORG_TENANT_INVITE_CREATE`), making the
  role distinction nearly meaningless in practice.
- No read-only role existed. Auditors, finance stakeholders, or read-only API integrations
  had to be granted `org_editor` (full write) just to read any data.
- `ORG_AUDIT_READ` was open to `org_editor`, exposing the full audit trail of all actors
  to a role that should only manage content.

**Platform roles:**
- `platform_admin` had identical permissions to `internal_admin` on all four internal
  action policies (`INTERNAL_TENANT_READ/WRITE`, `INTERNAL_USER_READ/WRITE`), meaning a
  compromised support-engineer token was as dangerous as a full operator token for
  destructive operations such as tenant creation and password reset.
- The name `platform_admin` implied operator-level authority but the intended use case was
  cross-tenant support impersonation (read-heavy, specific tenant context).
- No audit events were emitted when `platform_admin` exercised its bypass on org-scoped
  actions, making support activity invisible in the audit trail.

---

## 3. Agreed Role Redesign

### 3.1 Platform role rename

`platform_admin` is renamed to **`platform_support`**.

Rationale: the role is used by support engineers who need read-level visibility inside a
specific tenant's org portal. The previous name implied operator authority that the role
does not (and should not) carry. The new name accurately describes the use case.

`internal_admin` is unchanged. It remains the system-operator role with no tenant
context requirement and full internal management authority.

`platform_admin` is reserved for a future elevated tier (full operator + impersonation).
It will not exist as a Cognito group until that tier is formally designed.

### 3.2 New org role: `org_viewer`

A new **`org_viewer`** role is added between "no access" and `org_editor`.

`org_viewer` can read all resources within a tenant but cannot write anything. It is the
appropriate role for auditors, finance stakeholders, external QA reviewers, and read-only
API integrations.

### 3.3 Revised org permission matrix

| Action | `org_viewer` | `org_editor` | `org_admin` |
|---|:---:|:---:|:---:|
| Read profile / tenant check | ✓ | ✓ | ✓ |
| Read tenant branding / settings | ✓ | ✓ | ✓ |
| Read courses | ✓ | ✓ | ✓ |
| Read form schemas | ✓ | ✓ | ✓ |
| Read submissions | ✓ | ✓ | ✓ |
| Read assets | ✓ | ✓ | ✓ |
| Read audit log | ✓ | ✓ | ✓ |
| Write courses | ✗ | ✓ | ✓ |
| Write form schemas | ✗ | ✓ | ✓ |
| Upload assets | ✗ | ✓ | ✓ |
| Write submissions (status update) | ✗ | ✗ | ✓ |
| Write tenant branding / settings | ✗ | ✗ | ✓ |
| Create member invites | ✗ | ✗ | ✓ |

Key changes from the original design:
- `ORG_SUBMISSION_WRITE` and `ORG_TENANT_SETTINGS_WRITE` moved from both org roles to
  `org_admin`-only. Mutating submission lifecycle and org-wide settings are operational
  decisions, not content editing.
- `org_editor` is now genuinely scoped to content creation (courses, form schemas, assets).
- All read actions are now accessible to `org_viewer`.
- `ORG_AUDIT_READ` remains available to all three org roles — viewers need audit access
  for compliance purposes.

### 3.4 Revised platform permission matrix

| Action | `platform_support` | `internal_admin` |
|---|:---:|:---:|
| Internal tenant read | ✓ | ✓ |
| Internal tenant write | ✗ | ✓ |
| Internal user read | ✓ | ✓ |
| Internal user write | ✗ | ✓ |
| Org resource read (bypass) | ✓ (with audit log) | — |
| Org resource write (bypass) | ✗ | — |
| Tenant context required | Yes | No |
| Portal | Org | Internal |

`platform_support` retains read bypass on org resources (to support troubleshooting) but
is removed from all internal write actions. Every bypass exercise must emit an audit event.

### 3.5 Future: `platform_admin` (elevated tier)

When a formal escalation/oncall path is needed, `platform_admin` will be reintroduced as:
- All `internal_admin` permissions
- All `platform_support` permissions
- Write bypass on org resources (explicit, logged)

It will be a separate Cognito group requiring MFA and time-limited membership.

---

## 4. Implementation Notes

### Authorization policy target state (`authorization.ts`)

```typescript
const orgPolicies: Record<OrgPolicyAction, Policy> = {
  // All three org roles can read everything
  ORG_ME_READ:               { roles: ["org_viewer", "org_editor", "org_admin", "platform_support", "internal_admin"], allowPlatformBypass: true },
  ORG_TENANT_CHECK:          { roles: ["org_viewer", "org_editor", "org_admin", "platform_support"], allowPlatformBypass: true },
  ORG_TENANT_SETTINGS_READ:  { roles: ["org_viewer", "org_editor", "org_admin"] },
  ORG_COURSE_READ:           { roles: ["org_viewer", "org_editor", "org_admin"] },
  ORG_FORM_READ:             { roles: ["org_viewer", "org_editor", "org_admin"] },
  ORG_SUBMISSION_READ:       { roles: ["org_viewer", "org_editor", "org_admin"] },
  ORG_ASSET_READ:            { roles: ["org_viewer", "org_editor", "org_admin"] },
  ORG_AUDIT_READ:            { roles: ["org_viewer", "org_editor", "org_admin"] },

  // Editors can write content
  ORG_COURSE_WRITE:          { roles: ["org_editor", "org_admin"] },
  ORG_FORM_WRITE:            { roles: ["org_editor", "org_admin"] },
  ORG_ASSET_WRITE:           { roles: ["org_editor", "org_admin"] },

  // Admin-only operations
  ORG_SUBMISSION_WRITE:      { roles: ["org_admin"] },
  ORG_TENANT_SETTINGS_WRITE: { roles: ["org_admin"] },
  ORG_TENANT_INVITE_CREATE:  { roles: ["org_admin"] },

  // Internal operations — write restricted to internal_admin
  INTERNAL_TENANT_READ:      { roles: ["internal_admin", "platform_support"], allowPlatformBypass: true },
  INTERNAL_TENANT_WRITE:     { roles: ["internal_admin"] },
  INTERNAL_USER_READ:        { roles: ["internal_admin", "platform_support"], allowPlatformBypass: true },
  INTERNAL_USER_WRITE:       { roles: ["internal_admin"] },
};
```

### Cognito group mapping

| Role | Cognito group | Configurable |
|---|---|---|
| `org_viewer` | `org_viewer` | No |
| `org_editor` | `org_editor` | No |
| `org_admin` | `org_admin` | No |
| `platform_support` | `platform_support` | No |
| `internal_admin` | `CognitoInternalGroupName` param | Yes (default: `internal_admin`) |

### Invite roles

Valid roles that can be specified when creating a tenant invite:
- `org_viewer` (new)
- `org_editor`
- `org_admin`

`platform_support` and `internal_admin` are not invited via the org invite flow; they are
provisioned via the internal user management API.

---

## 5. Related Documents

- `docs/specs/PHASE_SECURITY_BACKEND.md` — security hardening phase (BS-01–BS-10)
- `docs/specs/PHASE_ROLE_REDESIGN_BACKEND.md` — implementation tasks for this redesign
- `docs/reference/auth-claims-strategy.md` — JWT claim sources and resolution order
- `docs/reference/auth-context-rollout.md` — session context and portal routing
- `docs/reference/internal-access-group-runbook.md` — Cognito group management runbook
- `docs/reference/api-contracts.md` — full endpoint and role matrix
