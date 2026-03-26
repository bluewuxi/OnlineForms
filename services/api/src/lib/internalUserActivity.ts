import { randomUUID } from "crypto";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { ApiError } from "./errors";

export type InternalUserActivityType =
  | "internal_user.created"
  | "internal_user.role_added"
  | "internal_user.role_removed"
  | "internal_user.activated"
  | "internal_user.deactivated"
  | "internal_user.password_reset"
  | "internal_user.login"
  | "internal_user.logout";

export type InternalUserActivityEntry = {
  id: string;
  userId: string;
  actorUserId: string | null;
  eventType: InternalUserActivityType;
  summary: string;
  details: Record<string, unknown>;
  createdAt: string;
};

export type InternalUserActivityPage = {
  data: InternalUserActivityEntry[];
  page: {
    limit: number;
    nextCursor: string | null;
  };
  sourceStatus: "ok" | "unavailable";
};

type WriteInternalUserActivityInput = {
  userId: string;
  actorUserId?: string | null;
  eventType: InternalUserActivityType;
  summary: string;
  details?: Record<string, unknown>;
};

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

function activityPk(userId: string): string {
  return `USER#${userId}`;
}

function activitySk(createdAt: string, activityId: string): string {
  return `ACTIVITY#${createdAt}#${activityId}`;
}

function parseLimit(limitRaw: number | undefined): number {
  if (limitRaw === undefined) return 20;
  if (!Number.isInteger(limitRaw) || limitRaw < 1 || limitRaw > 100) {
    throw new ApiError(400, "VALIDATION_ERROR", "limit must be an integer between 1 and 100.");
  }
  return limitRaw;
}

function encodeCursor(lastEvaluatedKey: Record<string, unknown> | undefined): string | null {
  if (!lastEvaluatedKey) return null;
  return Buffer.from(JSON.stringify(lastEvaluatedKey), "utf-8").toString("base64");
}

function decodeCursor(cursor: string): Record<string, unknown> {
  try {
    const text = Buffer.from(cursor, "base64").toString("utf-8");
    const parsed = JSON.parse(text) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object") {
      throw new Error("invalid");
    }
    return parsed;
  } catch {
    throw new ApiError(400, "VALIDATION_ERROR", "cursor is invalid.");
  }
}

function ensureTableName(): string {
  const tableName = process.env.ONLINEFORMS_INTERNAL_ACTIVITY_TABLE?.trim();
  if (!tableName) {
    throw new ApiError(500, "INTERNAL_ERROR", "ONLINEFORMS_INTERNAL_ACTIVITY_TABLE is required.");
  }
  return tableName;
}

function fromItem(item: Record<string, unknown>): InternalUserActivityEntry {
  return {
    id: item.activityId as string,
    userId: item.userId as string,
    actorUserId: (item.actorUserId as string | null | undefined) ?? null,
    eventType: item.eventType as InternalUserActivityType,
    summary: item.summary as string,
    details: (item.details as Record<string, unknown>) ?? {},
    createdAt: item.createdAt as string,
  };
}

let writeOverride: ((input: WriteInternalUserActivityInput) => Promise<void>) | null = null;
let listOverride:
  | ((userId: string, limit?: number, cursor?: string) => Promise<InternalUserActivityPage>)
  | null = null;

export const __internalUserActivityTestHooks = {
  setWriteOverride(loader: ((input: WriteInternalUserActivityInput) => Promise<void>) | null): void {
    writeOverride = loader;
  },
  setListOverride(
    loader: ((userId: string, limit?: number, cursor?: string) => Promise<InternalUserActivityPage>) | null,
  ): void {
    listOverride = loader;
  },
  reset(): void {
    writeOverride = null;
    listOverride = null;
  },
};

export async function writeInternalUserActivity(input: WriteInternalUserActivityInput): Promise<void> {
  if (writeOverride) {
    await writeOverride(input);
    return;
  }
  const resolvedTable = ensureTableName();
  const now = new Date().toISOString();
  const activityId = `act_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
  await ddb.send(
    new PutCommand({
      TableName: resolvedTable,
      Item: {
        PK: activityPk(input.userId),
        SK: activitySk(now, activityId),
        entityType: "INTERNAL_USER_ACTIVITY",
        userId: input.userId,
        activityId,
        actorUserId: input.actorUserId ?? null,
        eventType: input.eventType,
        summary: input.summary,
        details: input.details ?? {},
        createdAt: now,
      },
      ConditionExpression: "attribute_not_exists(PK) AND attribute_not_exists(SK)",
    }),
  );
}

export async function listInternalUserActivity(
  userId: string,
  limit?: number,
  cursor?: string,
): Promise<InternalUserActivityPage> {
  if (listOverride) {
    return listOverride(userId, limit, cursor);
  }
  const resolvedTable = ensureTableName();
  const resolvedLimit = parseLimit(limit);
  try {
    const out = await ddb.send(
      new QueryCommand({
        TableName: resolvedTable,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :activityPrefix)",
        ExpressionAttributeValues: {
          ":pk": activityPk(userId),
          ":activityPrefix": "ACTIVITY#",
        },
        ExclusiveStartKey: cursor ? decodeCursor(cursor) : undefined,
        Limit: resolvedLimit,
        ScanIndexForward: false,
      }),
    );
    return {
      data: (out.Items ?? []).map((item) => fromItem(item as Record<string, unknown>)),
      page: {
        limit: resolvedLimit,
        nextCursor: encodeCursor(out.LastEvaluatedKey as Record<string, unknown> | undefined),
      },
      sourceStatus: "ok",
    };
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    return {
      data: [],
      page: {
        limit: resolvedLimit,
        nextCursor: null,
      },
      sourceStatus: "unavailable",
    };
  }
}
