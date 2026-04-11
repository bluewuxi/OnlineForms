import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  QueryCommand,
  TransactWriteCommand
} from "@aws-sdk/lib-dynamodb";
import {
  AUTH_ENTITY_TYPES,
  AUTH_TABLE_NAME_DEFAULT,
  type AuthRole,
  authMembershipByTenantGsiPk,
  authMembershipByTenantGsiSk,
  authTenantInviteSk,
  authTenantMemberSk,
  authTenantPk,
  authUserMembershipSk,
  authUserPk
} from "../../../../shared/src/authTable";
import { ApiError } from "./errors";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const authTableName = process.env.ONLINEFORMS_AUTH_TABLE ?? AUTH_TABLE_NAME_DEFAULT;

const allowedMemberRoles = new Set<AuthRole>(["org_admin", "org_editor", "org_viewer"]);

export type TenantMember = {
  userId: string;
  email: string | null;
  role: "org_admin" | "org_editor" | "org_viewer";
  status: "active" | "invited" | "suspended";
  activatedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TenantInviteSummary = {
  inviteId: string;
  email: string;
  role: "org_admin" | "org_editor" | "org_viewer";
  status: "pending" | "accepted";
  expiresAt: string;
  createdAt: string;
  createdBy: string;
  acceptedAt: string | null;
};

function memberFromItem(item: Record<string, unknown>): TenantMember {
  return {
    userId: item.userId as string,
    email: (item.email as string | null) ?? null,
    role: item.role as "org_admin" | "org_editor" | "org_viewer",
    status: item.status as "active" | "invited" | "suspended",
    activatedAt: (item.activatedAt as string | null) ?? null,
    createdAt: item.createdAt as string,
    updatedAt: item.updatedAt as string
  };
}

function inviteFromItem(item: Record<string, unknown>): TenantInviteSummary {
  return {
    inviteId: item.inviteId as string,
    email: item.email as string,
    role: item.role as "org_admin" | "org_editor" | "org_viewer",
    status: item.status as "pending" | "accepted",
    expiresAt: item.expiresAt as string,
    createdAt: item.createdAt as string,
    createdBy: item.createdBy as string,
    acceptedAt: (item.acceptedAt as string | null) ?? null
  };
}

/**
 * List all members of a tenant via GSI1 (keyed by tenant).
 */
export async function listTenantMembers(tenantId: string): Promise<TenantMember[]> {
  const out = await ddb.send(
    new QueryCommand({
      TableName: authTableName,
      IndexName: "GSI1",
      KeyConditionExpression: "GSI1PK = :gsi1pk",
      ExpressionAttributeValues: {
        ":gsi1pk": authMembershipByTenantGsiPk(tenantId)
      }
    })
  );
  return (out.Items ?? [])
    .filter((item) => item.entityType === AUTH_ENTITY_TYPES.membership)
    .map((item) => memberFromItem(item as Record<string, unknown>));
}

/**
 * List all invites for a tenant (pending and accepted).
 */
export async function listTenantInvites(
  tenantId: string,
  statusFilter?: "pending" | "accepted"
): Promise<TenantInviteSummary[]> {
  const out = await ddb.send(
    new QueryCommand({
      TableName: authTableName,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :invitePrefix)",
      ExpressionAttributeValues: {
        ":pk": authTenantPk(tenantId),
        ":invitePrefix": "INVITE#"
      }
    })
  );
  const items = (out.Items ?? []) as Array<Record<string, unknown>>;
  const invites = items
    .filter((item) => item.entityType === AUTH_ENTITY_TYPES.invite)
    .map(inviteFromItem);
  if (statusFilter) {
    return invites.filter((inv) => inv.status === statusFilter);
  }
  return invites;
}

/**
 * Update a tenant member's role. Updates both the user-centric and tenant-centric records atomically.
 * Cannot change the role of the last org_admin.
 */
export async function updateTenantMemberRole(
  tenantId: string,
  userId: string,
  newRole: "org_admin" | "org_editor" | "org_viewer",
  actorUserId: string
): Promise<TenantMember> {
  if (!allowedMemberRoles.has(newRole as AuthRole)) {
    throw new ApiError(400, "VALIDATION_ERROR", "role must be org_admin, org_editor, or org_viewer.");
  }

  // Safety check: if demoting an org_admin, ensure it's not the last one.
  if (newRole !== "org_admin") {
    const members = await listTenantMembers(tenantId);
    const targetMember = members.find((m) => m.userId === userId);
    if (!targetMember) {
      throw new ApiError(404, "NOT_FOUND", "Member not found in this tenant.");
    }
    if (targetMember.role === "org_admin") {
      const adminCount = members.filter((m) => m.role === "org_admin" && m.status === "active").length;
      if (adminCount <= 1) {
        throw new ApiError(
          409,
          "CONFLICT",
          "Cannot change the role of the last active org_admin in this tenant."
        );
      }
    }
  } else {
    // Verify member exists when promoting
    const members = await listTenantMembers(tenantId);
    const targetMember = members.find((m) => m.userId === userId);
    if (!targetMember) {
      throw new ApiError(404, "NOT_FOUND", "Member not found in this tenant.");
    }
  }

  const now = new Date().toISOString();

  await ddb.send(
    new TransactWriteCommand({
      TransactItems: [
        {
          Update: {
            TableName: authTableName,
            Key: {
              PK: authUserPk(userId),
              SK: authUserMembershipSk(tenantId)
            },
            ConditionExpression: "attribute_exists(PK) AND attribute_exists(SK)",
            UpdateExpression:
              "SET #role = :role, allowedRoles = :allowedRoles, GSI1SK = :gsi1sk, updatedAt = :updatedAt, updatedBy = :updatedBy",
            ExpressionAttributeNames: {
              "#role": "role"
            },
            ExpressionAttributeValues: {
              ":role": newRole,
              ":allowedRoles": [newRole],
              ":gsi1sk": authMembershipByTenantGsiSk(newRole as AuthRole, userId),
              ":updatedAt": now,
              ":updatedBy": actorUserId
            }
          }
        },
        {
          Update: {
            TableName: authTableName,
            Key: {
              PK: authTenantPk(tenantId),
              SK: authTenantMemberSk(userId)
            },
            ConditionExpression: "attribute_exists(PK) AND attribute_exists(SK)",
            UpdateExpression:
              "SET #role = :role, allowedRoles = :allowedRoles, updatedAt = :updatedAt, updatedBy = :updatedBy",
            ExpressionAttributeNames: {
              "#role": "role"
            },
            ExpressionAttributeValues: {
              ":role": newRole,
              ":allowedRoles": [newRole],
              ":updatedAt": now,
              ":updatedBy": actorUserId
            }
          }
        }
      ]
    })
  );

  return {
    userId,
    email: null,
    role: newRole,
    status: "active",
    activatedAt: null,
    createdAt: now,
    updatedAt: now
  };
}

/**
 * Remove a tenant member. Deletes both the user-centric and tenant-centric records atomically.
 * Cannot remove the last active org_admin.
 */
export async function removeTenantMember(
  tenantId: string,
  userId: string,
  actorUserId: string
): Promise<void> {
  const members = await listTenantMembers(tenantId);
  const targetMember = members.find((m) => m.userId === userId);
  if (!targetMember) {
    throw new ApiError(404, "NOT_FOUND", "Member not found in this tenant.");
  }

  if (targetMember.role === "org_admin" && targetMember.status === "active") {
    const activeAdminCount = members.filter((m) => m.role === "org_admin" && m.status === "active").length;
    if (activeAdminCount <= 1) {
      throw new ApiError(
        409,
        "CONFLICT",
        "Cannot remove the last active org_admin from this tenant."
      );
    }
  }

  if (actorUserId === userId) {
    throw new ApiError(409, "CONFLICT", "Cannot remove yourself from the tenant.");
  }

  await ddb.send(
    new TransactWriteCommand({
      TransactItems: [
        {
          Delete: {
            TableName: authTableName,
            Key: {
              PK: authUserPk(userId),
              SK: authUserMembershipSk(tenantId)
            },
            ConditionExpression: "attribute_exists(PK) AND attribute_exists(SK)"
          }
        },
        {
          Delete: {
            TableName: authTableName,
            Key: {
              PK: authTenantPk(tenantId),
              SK: authTenantMemberSk(userId)
            },
            ConditionExpression: "attribute_exists(PK) AND attribute_exists(SK)"
          }
        }
      ]
    })
  );
}
