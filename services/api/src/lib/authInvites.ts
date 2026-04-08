import { randomUUID } from "crypto";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
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
const allowedInviteRoles = new Set<AuthRole>(["org_admin", "org_editor", "org_viewer"]);

export type TenantInvite = {
  inviteId: string;
  tenantId: string;
  email: string;
  role: "org_admin" | "org_editor" | "org_viewer";
  status: "pending" | "accepted";
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
  acceptedAt: string | null;
  acceptedBy: string | null;
};

export type CreateTenantInviteInput = {
  email: string;
  role: "org_admin" | "org_editor" | "org_viewer";
  expiresInDays?: number;
};

function normalizeEmail(email: string): string {
  const normalized = email.trim().toLowerCase();
  if (!normalized || !normalized.includes("@")) {
    throw new ApiError(400, "VALIDATION_ERROR", "email must be a valid email address.");
  }
  return normalized;
}

function toRole(role: string): "org_admin" | "org_editor" | "org_viewer" {
  if (!allowedInviteRoles.has(role as AuthRole)) {
    throw new ApiError(400, "VALIDATION_ERROR", "role must be org_admin, org_editor, or org_viewer.");
  }
  return role as "org_admin" | "org_editor" | "org_viewer";
}

function expiresAtFromDays(expiresInDays?: number): string {
  const days = expiresInDays ?? 7;
  if (!Number.isInteger(days) || days < 1 || days > 30) {
    throw new ApiError(400, "VALIDATION_ERROR", "expiresInDays must be an integer between 1 and 30.");
  }
  const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  return expiresAt.toISOString();
}

function inviteFromItem(item: Record<string, unknown>): TenantInvite {
  return {
    inviteId: item.inviteId as string,
    tenantId: item.tenantId as string,
    email: item.email as string,
    role: item.role as "org_admin" | "org_editor" | "org_viewer",
    status: item.status as "pending" | "accepted",
    expiresAt: item.expiresAt as string,
    createdAt: item.createdAt as string,
    updatedAt: item.updatedAt as string,
    createdBy: item.createdBy as string,
    updatedBy: item.updatedBy as string,
    acceptedAt: (item.acceptedAt as string | null) ?? null,
    acceptedBy: (item.acceptedBy as string | null) ?? null
  };
}

export async function createTenantInvite(
  tenantId: string,
  createdBy: string,
  input: CreateTenantInviteInput
): Promise<TenantInvite> {
  const now = new Date().toISOString();
  const inviteId = `inv_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
  const normalizedEmail = normalizeEmail(input.email);
  const role = toRole(input.role);
  const expiresAt = expiresAtFromDays(input.expiresInDays);

  const item: Record<string, unknown> = {
    PK: authTenantPk(tenantId),
    SK: authTenantInviteSk(inviteId),
    entityType: AUTH_ENTITY_TYPES.invite,
    tenantId,
    inviteId,
    email: normalizedEmail,
    role,
    status: "pending",
    expiresAt,
    createdAt: now,
    updatedAt: now,
    createdBy,
    updatedBy: createdBy,
    acceptedAt: null,
    acceptedBy: null
  };

  await ddb.send(
    new PutCommand({
      TableName: authTableName,
      Item: item,
      ConditionExpression: "attribute_not_exists(PK) AND attribute_not_exists(SK)"
    })
  );

  return inviteFromItem(item);
}

export async function acceptTenantInvite(
  tenantId: string,
  inviteId: string,
  acceptedByUserId: string,
  acceptedByEmail: string
): Promise<{ tenantId: string; userId: string; role: "org_admin" | "org_editor" | "org_viewer"; activatedAt: string }> {
  const inviteKey = {
    PK: authTenantPk(tenantId),
    SK: authTenantInviteSk(inviteId)
  };
  const inviteOut = await ddb.send(
    new GetCommand({
      TableName: authTableName,
      Key: inviteKey
    })
  );
  const invite = inviteOut.Item as Record<string, unknown> | undefined;
  if (!invite || invite.entityType !== AUTH_ENTITY_TYPES.invite) {
    throw new ApiError(404, "NOT_FOUND", "Invite not found.");
  }

  const status = invite.status;
  const role = invite.role;
  const expiresAt = invite.expiresAt;
  if (status !== "pending") {
    throw new ApiError(409, "CONFLICT", "Invite is not pending.");
  }
  if (typeof expiresAt !== "string" || Date.parse(expiresAt) < Date.now()) {
    throw new ApiError(409, "CONFLICT", "Invite has expired.");
  }
  if (typeof role !== "string" || !allowedInviteRoles.has(role as AuthRole)) {
    throw new ApiError(409, "CONFLICT", "Invite role is invalid.");
  }
  const inviteEmail = typeof invite.email === "string" ? normalizeEmail(invite.email) : null;
  const callerEmail = normalizeEmail(acceptedByEmail);
  if (!inviteEmail || callerEmail !== inviteEmail) {
    throw new ApiError(403, "FORBIDDEN", "Authenticated user email does not match the invite target.");
  }

  const now = new Date().toISOString();
  const membershipItem = {
    PK: authUserPk(acceptedByUserId),
    SK: authUserMembershipSk(tenantId),
    entityType: AUTH_ENTITY_TYPES.membership,
    tenantId,
    userId: acceptedByUserId,
    role,
    allowedRoles: [role],
    status: "active",
    activatedAt: now,
    activatedBy: acceptedByUserId,
    acceptedInviteId: inviteId,
    createdAt: now,
    updatedAt: now,
    createdBy: acceptedByUserId,
    updatedBy: acceptedByUserId,
    GSI1PK: authMembershipByTenantGsiPk(tenantId),
    GSI1SK: authMembershipByTenantGsiSk(role as AuthRole, acceptedByUserId)
  };
  const tenantMemberItem = {
    PK: authTenantPk(tenantId),
    SK: authTenantMemberSk(acceptedByUserId),
    entityType: AUTH_ENTITY_TYPES.membership,
    tenantId,
    userId: acceptedByUserId,
    role,
    allowedRoles: [role],
    status: "active",
    activatedAt: now,
    activatedBy: acceptedByUserId,
    acceptedInviteId: inviteId,
    createdAt: now,
    updatedAt: now,
    createdBy: acceptedByUserId,
    updatedBy: acceptedByUserId
  };

  await ddb.send(
    new TransactWriteCommand({
      TransactItems: [
        {
          Put: {
            TableName: authTableName,
            Item: membershipItem
          }
        },
        {
          Put: {
            TableName: authTableName,
            Item: tenantMemberItem
          }
        },
        {
          Update: {
            TableName: authTableName,
            Key: inviteKey,
            ConditionExpression: "#status = :pending",
            UpdateExpression:
              "SET #status = :accepted, #acceptedAt = :acceptedAt, #acceptedBy = :acceptedBy, #updatedAt = :updatedAt, #updatedBy = :updatedBy",
            ExpressionAttributeNames: {
              "#status": "status",
              "#acceptedAt": "acceptedAt",
              "#acceptedBy": "acceptedBy",
              "#updatedAt": "updatedAt",
              "#updatedBy": "updatedBy"
            },
            ExpressionAttributeValues: {
              ":pending": "pending",
              ":accepted": "accepted",
              ":acceptedAt": now,
              ":acceptedBy": acceptedByUserId,
              ":updatedAt": now,
              ":updatedBy": acceptedByUserId
            }
          }
        }
      ]
    })
  );

  return {
    tenantId,
    userId: acceptedByUserId,
    role: role as "org_admin" | "org_editor" | "org_viewer",
    activatedAt: now
  };
}
