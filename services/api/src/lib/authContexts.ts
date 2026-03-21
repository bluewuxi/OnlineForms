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
const supportedRoles = new Set<SessionContextRole>([
  "org_admin",
  "org_editor",
  "platform_admin",
  "internal_admin"
]);

export type UserTenantContext = {
  tenantId: string;
  status: "active" | "invited" | "suspended";
  roles: SessionContextRole[];
};

export async function listUserTenantContexts(userId: string): Promise<UserTenantContext[]> {
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
        item.status === "active" || item.status === "invited" || item.status === "suspended"
          ? item.status
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

export function assertTenantRoleAllowed(
  contexts: UserTenantContext[],
  tenantId: string,
  role: SessionContextRole
): void {
  const context = contexts.find((item) => item.tenantId === tenantId);
  if (!context || context.status !== "active") {
    throw new ApiError(403, "FORBIDDEN", "User does not have active membership for selected tenant.");
  }
  if (!context.roles.includes(role)) {
    throw new ApiError(403, "FORBIDDEN", "Selected role is not allowed for selected tenant.");
  }
}
