export type AuthRoleOption = {
  role: "org_admin" | "org_editor" | "internal_admin" | "platform_admin";
  label: string;
  requiresTenant: boolean;
};

export const AUTH_ROLE_OPTIONS: AuthRoleOption[] = [
  { role: "org_admin", label: "Org Admin", requiresTenant: true },
  { role: "org_editor", label: "Org Editor", requiresTenant: true },
  { role: "internal_admin", label: "Internal Admin", requiresTenant: false },
  { role: "platform_admin", label: "Platform Admin", requiresTenant: true }
];
