import { ApiError } from "./errors";
import type { AuthContext, AuthRole } from "./auth";

export type OrgPolicyAction =
  | "ORG_ME_READ"
  | "ORG_TENANT_CHECK"
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
  | "ORG_TENANT_INVITE_CREATE";

type Policy = {
  roles: AuthRole[];
  allowPlatformBypass: boolean;
};

const orgPolicies: Record<OrgPolicyAction, Policy> = {
  ORG_ME_READ: { roles: ["org_admin", "org_editor", "platform_admin"], allowPlatformBypass: true },
  ORG_TENANT_CHECK: { roles: ["org_admin", "org_editor", "platform_admin"], allowPlatformBypass: true },
  ORG_COURSE_READ: { roles: ["org_admin", "org_editor"], allowPlatformBypass: false },
  ORG_COURSE_WRITE: { roles: ["org_admin", "org_editor"], allowPlatformBypass: false },
  ORG_FORM_READ: { roles: ["org_admin", "org_editor"], allowPlatformBypass: false },
  ORG_FORM_WRITE: { roles: ["org_admin", "org_editor"], allowPlatformBypass: false },
  ORG_SUBMISSION_READ: { roles: ["org_admin", "org_editor"], allowPlatformBypass: false },
  ORG_SUBMISSION_WRITE: { roles: ["org_admin", "org_editor"], allowPlatformBypass: false },
  ORG_ASSET_READ: { roles: ["org_admin", "org_editor"], allowPlatformBypass: false },
  ORG_ASSET_WRITE: { roles: ["org_admin", "org_editor"], allowPlatformBypass: false },
  ORG_AUDIT_READ: { roles: ["org_admin", "org_editor"], allowPlatformBypass: false },
  ORG_TENANT_SETTINGS_WRITE: { roles: ["org_admin", "org_editor"], allowPlatformBypass: false },
  ORG_TENANT_INVITE_CREATE: { roles: ["org_admin"], allowPlatformBypass: false }
};

export function authorizeOrgAction(
  auth: AuthContext,
  action: OrgPolicyAction,
  resourceTenantId: string = auth.tenantId
): void {
  const policy = orgPolicies[action];
  if (!policy.roles.includes(auth.role)) {
    throw new ApiError(403, "FORBIDDEN", "Role not allowed for this operation.");
  }

  if (auth.role === "platform_admin" && !policy.allowPlatformBypass) {
    throw new ApiError(
      403,
      "FORBIDDEN",
      "platform_admin is not allowed to bypass tenant scope for this endpoint."
    );
  }

  if (auth.role !== "platform_admin" && auth.tenantId !== resourceTenantId) {
    throw new ApiError(403, "FORBIDDEN", "Cross-tenant access is denied.");
  }
}
