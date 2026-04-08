export type AuthRoleOption = {
  role: "org_viewer" | "org_editor" | "org_admin" | "internal_admin" | "platform_support";
  label: string;
  requiresTenant: boolean;
};

export const AUTH_ROLE_OPTIONS: AuthRoleOption[] = [
  { role: "org_viewer",       label: "Org Viewer",       requiresTenant: true  },
  { role: "org_editor",       label: "Org Editor",       requiresTenant: true  },
  { role: "org_admin",        label: "Org Admin",        requiresTenant: true  },
  { role: "internal_admin",   label: "Internal Admin",   requiresTenant: false },
  { role: "platform_support", label: "Platform Support", requiresTenant: true  }
];
