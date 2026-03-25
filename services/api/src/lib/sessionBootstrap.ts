import type { AuthRole } from "./auth";
import type { UserTenantContext } from "./authContexts";

export type PortalKind = "org" | "internal";

export type SessionShell = {
  portal: PortalKind;
  tenantScoped: boolean;
};

export type SessionContextSelection = {
  tenantId: string | null;
  role: AuthRole;
  portal: PortalKind;
};

export type SessionBootstrapResponseData = {
  userId: string;
  tenantId: string | null;
  role: AuthRole;
  shell: SessionShell;
};

function toPortal(role: AuthRole, tenantId: string | null): PortalKind {
  if (role === "internal_admin" && tenantId === null) {
    return "internal";
  }
  return "org";
}

export function toNullableTenantId(tenantId: string): string | null {
  return tenantId === "__internal__" || tenantId === "__unscoped__" ? null : tenantId;
}

export function buildSessionBootstrapResponseData(
  userId: string,
  role: AuthRole,
  tenantId: string | null
): SessionBootstrapResponseData {
  const portal = toPortal(role, tenantId);
  return {
    userId,
    tenantId,
    role,
    shell: {
      portal,
      tenantScoped: tenantId !== null
    }
  };
}

export function listAvailablePortals(
  contexts: UserTenantContext[],
  canAccessInternalPortal: boolean
): PortalKind[] {
  const portals = new Set<PortalKind>();
  if (contexts.length > 0) {
    portals.add("org");
  }
  if (canAccessInternalPortal) {
    portals.add("internal");
  }
  return Array.from(portals);
}

export function buildSuggestedContext(
  contexts: UserTenantContext[],
  canAccessInternalPortal: boolean
): SessionContextSelection | null {
  const activeContexts = contexts.filter((context) => context.status === "active");
  const options: SessionContextSelection[] = [];

  for (const context of activeContexts) {
    for (const role of context.roles) {
      if (role === "internal_admin") {
        continue;
      }
      options.push({
        tenantId: context.tenantId,
        role,
        portal: "org"
      });
    }
  }

  if (canAccessInternalPortal) {
    options.push({
      tenantId: null,
      role: "internal_admin",
      portal: "internal"
    });
  }

  return options.length === 1 ? options[0] : null;
}
