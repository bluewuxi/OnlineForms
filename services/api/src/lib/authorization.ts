import { ApiError } from "./errors";
import type { AuthContext, AuthRole } from "./auth";
import { emitPlatformSupportBypassMetric, emitRoleDeniedMetric, emitTenantMismatchMetric, logAuthAudit } from "./authObservability";

export type OrgPolicyAction =
  | "ORG_ME_READ"
  | "ORG_TENANT_CHECK"
  | "ORG_TENANT_SETTINGS_READ"
  | "ORG_COURSE_READ"
  | "ORG_COURSE_WRITE"
  | "ORG_FORM_READ"
  | "ORG_FORM_WRITE"
  | "ORG_SUBMISSION_READ"
  | "ORG_SUBMISSION_WRITE"
  | "ORG_ASSET_READ"
  | "ORG_ASSET_WRITE"
  | "ORG_AUDIT_READ"
  | "ORG_TENANT_SETTINGS_WRITE"
  | "ORG_TENANT_INVITE_CREATE"
  | "ORG_MEMBER_READ"
  | "ORG_MEMBER_WRITE"
  | "INTERNAL_TENANT_READ"
  | "INTERNAL_TENANT_WRITE"
  | "INTERNAL_USER_READ"
  | "INTERNAL_USER_WRITE";

type Policy = {
  roles: AuthRole[];
  allowPlatformBypass: boolean;
};

const orgPolicies: Record<OrgPolicyAction, Policy> = {
  // All three org roles + platform_support (read bypass) can read everything
  ORG_ME_READ:              { roles: ["org_viewer", "org_editor", "org_admin", "platform_support", "internal_admin"], allowPlatformBypass: true },
  ORG_TENANT_CHECK:         { roles: ["org_viewer", "org_editor", "org_admin", "platform_support"], allowPlatformBypass: true },
  ORG_TENANT_SETTINGS_READ: { roles: ["org_viewer", "org_editor", "org_admin"], allowPlatformBypass: true },
  ORG_COURSE_READ:          { roles: ["org_viewer", "org_editor", "org_admin"], allowPlatformBypass: true },
  ORG_FORM_READ:            { roles: ["org_viewer", "org_editor", "org_admin"], allowPlatformBypass: true },
  ORG_SUBMISSION_READ:      { roles: ["org_viewer", "org_editor", "org_admin"], allowPlatformBypass: true },
  ORG_ASSET_READ:           { roles: ["org_viewer", "org_editor", "org_admin"], allowPlatformBypass: true },
  ORG_AUDIT_READ:           { roles: ["org_viewer", "org_editor", "org_admin"], allowPlatformBypass: true },
  // Editors can write content; platform_support cannot write
  ORG_COURSE_WRITE:         { roles: ["org_editor", "org_admin"], allowPlatformBypass: false },
  ORG_FORM_WRITE:           { roles: ["org_editor", "org_admin"], allowPlatformBypass: false },
  ORG_ASSET_WRITE:          { roles: ["org_editor", "org_admin"], allowPlatformBypass: false },
  // Admin-only operations (BR-03)
  ORG_SUBMISSION_WRITE:     { roles: ["org_admin"], allowPlatformBypass: false },
  ORG_TENANT_SETTINGS_WRITE:{ roles: ["org_admin"], allowPlatformBypass: false },
  ORG_TENANT_INVITE_CREATE: { roles: ["org_admin"], allowPlatformBypass: false },
  ORG_MEMBER_READ:          { roles: ["org_viewer", "org_editor", "org_admin"], allowPlatformBypass: true },
  ORG_MEMBER_WRITE:         { roles: ["org_admin"], allowPlatformBypass: false },
  // Internal operations — write restricted to internal_admin only (BR-04)
  INTERNAL_TENANT_READ:     { roles: ["internal_admin", "platform_support"], allowPlatformBypass: true },
  INTERNAL_TENANT_WRITE:    { roles: ["internal_admin"], allowPlatformBypass: false },
  INTERNAL_USER_READ:       { roles: ["internal_admin", "platform_support"], allowPlatformBypass: true },
  INTERNAL_USER_WRITE:      { roles: ["internal_admin"], allowPlatformBypass: false },
};

export function authorizeOrgAction(
  auth: AuthContext,
  action: OrgPolicyAction,
  resourceTenantId: string = auth.tenantId
): void {
  const policy = orgPolicies[action];
  if (!policy.roles.includes(auth.role)) {
    emitRoleDeniedMetric();
    logAuthAudit("auth_role_denied", { action, role: auth.role, tenantId: auth.tenantId });
    throw new ApiError(403, "FORBIDDEN", "Role not allowed for this operation.");
  }

  // platform_support bypass: allowed only on read actions marked allowPlatformBypass.
  if (auth.role === "platform_support") {
    if (!policy.allowPlatformBypass) {
      emitRoleDeniedMetric();
      logAuthAudit("auth_role_denied", {
        action,
        role: auth.role,
        tenantId: auth.tenantId,
        reason: "platform_bypass_not_allowed"
      });
      throw new ApiError(
        403,
        "FORBIDDEN",
        "platform_support is not allowed to bypass tenant scope for this endpoint."
      );
    }
    // BR-05: emit metric + audit event every time the bypass is exercised so
    // support activity is visible in the audit trail and can be alarmed on.
    emitPlatformSupportBypassMetric();
    logAuthAudit("auth_platform_support_bypass", {
      action,
      userId: auth.userId,
      tenantId: resourceTenantId
    });
    return;
  }

  if (action.startsWith("INTERNAL_")) {
    return;
  }

  if (auth.tenantId !== resourceTenantId) {
    emitTenantMismatchMetric();
    logAuthAudit("auth_tenant_mismatch", {
      action,
      role: auth.role,
      authTenantId: auth.tenantId,
      resourceTenantId
    });
    throw new ApiError(403, "FORBIDDEN", "Cross-tenant access is denied.");
  }
}
