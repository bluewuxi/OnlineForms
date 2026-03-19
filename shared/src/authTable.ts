export const AUTH_TABLE_NAME_DEFAULT = "OnlineFormsAuth";

export const AUTH_ENTITY_TYPES = {
  userProfile: "AUTH_USER_PROFILE",
  membership: "AUTH_MEMBERSHIP",
  invite: "AUTH_INVITE"
} as const;

export type AuthRole = "org_admin" | "org_editor" | "platform_admin";
export type MembershipStatus = "active" | "invited" | "suspended";

export function authUserPk(userId: string): string {
  return `USER#${userId}`;
}

export function authUserProfileSk(): string {
  return "PROFILE";
}

export function authUserMembershipSk(tenantId: string): string {
  return `MEMBERSHIP#${tenantId}`;
}

export function authTenantPk(tenantId: string): string {
  return `TENANT#${tenantId}`;
}

export function authTenantMemberSk(userId: string): string {
  return `MEMBER#${userId}`;
}

export function authTenantInviteSk(inviteId: string): string {
  return `INVITE#${inviteId}`;
}

export function authMembershipByTenantGsiPk(tenantId: string): string {
  return `TENANT#${tenantId}#MEMBERS`;
}

export function authMembershipByTenantGsiSk(role: AuthRole, userId: string): string {
  return `ROLE#${role}#USER#${userId}`;
}
