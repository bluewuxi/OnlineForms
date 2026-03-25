import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand } from "@aws-sdk/lib-dynamodb";
import {
  AUTH_TABLE_NAME_DEFAULT,
  authUserPk
} from "../../../../shared/src/authTable";
import { ApiError } from "./errors";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const authTableName = process.env.ONLINEFORMS_AUTH_TABLE ?? AUTH_TABLE_NAME_DEFAULT;
export type SessionContextRole = "org_admin" | "org_editor" | "platform_admin" | "internal_admin";
export type SessionContextStatus = "active" | "invited" | "suspended";
const supportedRoles = new Set<SessionContextRole>([
  "org_admin",
  "org_editor",
  "platform_admin",
  "internal_admin"
]);
const supportedStatuses = new Set<SessionContextStatus>(["active", "invited", "suspended"]);

export type UserTenantContext = {
  tenantId: string;
  status: SessionContextStatus;
  roles: SessionContextRole[];
};

let testContextLoaderOverride: ((userId: string) => Promise<UserTenantContext[]>) | null = null;

export async function listUserTenantContexts(userId: string): Promise<UserTenantContext[]> {
  if (testContextLoaderOverride) {
    return testContextLoaderOverride(userId);
  }
  const out = await ddb.send(
    new QueryCommand({
      TableName: authTableName,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :membershipPrefix)",
      ExpressionAttributeValues: {
        ":pk": authUserPk(userId),
        ":membershipPrefix": "MEMBERSHIP#"
      }
    })
  );

  const items = (out.Items ?? []) as Array<Record<string, unknown>>;
  return items
    .map((item): UserTenantContext | null => {
      const tenantId = typeof item.tenantId === "string" ? item.tenantId.trim() : "";
      const status =
        typeof item.status === "string" && supportedStatuses.has(item.status as SessionContextStatus)
          ? (item.status as SessionContextStatus)
          : null;
      if (!tenantId || !status) return null;

      const allowedRolesRaw = item.allowedRoles;
      const role = typeof item.role === "string" ? item.role : null;
      const roles =
        Array.isArray(allowedRolesRaw) && allowedRolesRaw.length > 0
          ? allowedRolesRaw.filter(
              (value): value is SessionContextRole =>
                typeof value === "string" && supportedRoles.has(value as SessionContextRole)
            )
          : role && supportedRoles.has(role as SessionContextRole)
            ? [role as SessionContextRole]
            : [];
      if (roles.length === 0) return null;

      return {
        tenantId,
        status,
        roles
      };
    })
    .filter((value): value is UserTenantContext => Boolean(value));
}

export function parseContextStatusFilter(
  rawStatus: string | undefined
): SessionContextStatus[] | undefined {
  if (!rawStatus || rawStatus.trim().length === 0) return undefined;
  const statuses = rawStatus
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0);
  if (statuses.length === 0) return undefined;
  const invalid = statuses.find((entry) => !supportedStatuses.has(entry as SessionContextStatus));
  if (invalid) {
    throw new ApiError(400, "VALIDATION_ERROR", "status filter is invalid.");
  }
  return Array.from(new Set(statuses as SessionContextStatus[]));
}

export function filterUserTenantContextsByStatus(
  contexts: UserTenantContext[],
  statuses: SessionContextStatus[] | undefined
): UserTenantContext[] {
  if (!statuses || statuses.length === 0) return contexts;
  return contexts.filter((context) => statuses.includes(context.status));
}

export function assertTenantRoleAllowed(
  contexts: UserTenantContext[],
  tenantId: string,
  role: SessionContextRole
): void {
  const context = contexts.find((item) => item.tenantId === tenantId);
  if (!context || context.status !== "active") {
    throw new ApiError(403, "FORBIDDEN", "User does not have active membership for selected tenant.", [
      { field: "tenantId", issue: "invalid_context" }
    ]);
  }
  if (!context.roles.includes(role)) {
    throw new ApiError(403, "FORBIDDEN", "Selected role is not allowed for selected tenant.", [
      { field: "role", issue: "invalid_context" }
    ]);
  }
}

export const __authContextsTestHooks = {
  setContextLoaderOverride(loader: ((userId: string) => Promise<UserTenantContext[]>) | null): void {
    testContextLoaderOverride = loader;
  },
  reset(): void {
    testContextLoaderOverride = null;
  }
};
