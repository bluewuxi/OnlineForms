import { randomUUID } from "crypto";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { ApiError } from "./errors";

export type AuditAction =
  | "course.create"
  | "course.publish"
  | "course.archive"
  | "form.upsert"
  | "submission.create"
  | "submission.status_update"
  | "branding.update"
  | "tenant.create"
  | "tenant.update"
  | "tenant.activate"
  | "tenant.deactivate";

export type AuditEventInput = {
  tenantId: string;
  actorUserId: string;
  action: AuditAction;
  resourceType: "course" | "form" | "submission" | "branding" | "tenant";
  resourceId: string;
  correlationId: string;
  requestId: string;
  details?: Record<string, unknown>;
};

export type AuditEvent = {
  id: string;
  tenantId: string;
  actorUserId: string;
  action: AuditAction;
  resourceType: string;
  resourceId: string;
  correlationId: string;
  requestId: string;
  details: Record<string, unknown>;
  createdAt: string;
};

export type ListAuditInput = {
  action?: string;
  resourceType?: string;
  createdFrom?: string;
  createdTo?: string;
  limit?: number;
  cursor?: string;
};

export type ListAuditResult = {
  data: AuditEvent[];
  page: { limit: number; nextCursor: string | null };
};

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const tableName = process.env.ONLINEFORMS_TABLE ?? "OnlineFormsMain";

let testWriteAuditEventOverride: ((input: AuditEventInput) => Promise<void>) | null = null;

function tenantPk(tenantId: string): string {
  return `TENANT#${tenantId}`;
}

function auditSk(timestampIso: string, auditId: string): string {
  return `AUDIT#${timestampIso}#${auditId}`;
}

function parseLimit(limitRaw: number | undefined): number {
  if (limitRaw === undefined) return 20;
  if (!Number.isInteger(limitRaw) || limitRaw < 1 || limitRaw > 100) {
    throw new ApiError(400, "VALIDATION_ERROR", "limit must be an integer between 1 and 100.");
  }
  return limitRaw;
}

function parseIso(value: string, field: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new ApiError(400, "VALIDATION_ERROR", `${field} must be a valid ISO date-time.`);
  }
  return d.toISOString();
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

function fromItem(item: Record<string, unknown>): AuditEvent {
  return {
    id: item.auditId as string,
    tenantId: item.tenantId as string,
    actorUserId: item.actorUserId as string,
    action: item.action as AuditAction,
    resourceType: item.resourceType as string,
    resourceId: item.resourceId as string,
    correlationId: item.correlationId as string,
    requestId: item.requestId as string,
    details: (item.details as Record<string, unknown>) ?? {},
    createdAt: item.createdAt as string
  };
}

export async function writeAuditEvent(input: AuditEventInput): Promise<void> {
  if (testWriteAuditEventOverride) {
    return testWriteAuditEventOverride(input);
  }
  const now = new Date().toISOString();
  const auditId = `aud_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
  await ddb.send(
    new PutCommand({
      TableName: tableName,
      Item: {
        PK: tenantPk(input.tenantId),
        SK: auditSk(now, auditId),
        entityType: "AUDIT_EVENT",
        tenantId: input.tenantId,
        auditId,
        action: input.action,
        actorUserId: input.actorUserId,
        resourceType: input.resourceType,
        resourceId: input.resourceId,
        correlationId: input.correlationId,
        requestId: input.requestId,
        details: input.details ?? {},
        createdAt: now
      },
      ConditionExpression: "attribute_not_exists(PK) AND attribute_not_exists(SK)"
    })
  );
}

export async function listAuditEvents(tenantId: string, input: ListAuditInput): Promise<ListAuditResult> {
  const limit = parseLimit(input.limit);
  const createdFrom = input.createdFrom ? parseIso(input.createdFrom, "createdFrom") : undefined;
  const createdTo = input.createdTo ? parseIso(input.createdTo, "createdTo") : undefined;
  if (createdFrom && createdTo && createdFrom > createdTo) {
    throw new ApiError(400, "VALIDATION_ERROR", "createdFrom must be before or equal to createdTo.");
  }

  const exprValues: Record<string, unknown> = {
    ":pk": tenantPk(tenantId),
    ":sk": "AUDIT#"
  };
  const filters: string[] = [];

  if (input.action) {
    exprValues[":action"] = input.action;
    filters.push("#action = :action");
  }
  if (input.resourceType) {
    exprValues[":resourceType"] = input.resourceType;
    filters.push("resourceType = :resourceType");
  }
  if (createdFrom) {
    exprValues[":createdFrom"] = createdFrom;
    filters.push("createdAt >= :createdFrom");
  }
  if (createdTo) {
    exprValues[":createdTo"] = createdTo;
    filters.push("createdAt <= :createdTo");
  }

  const out = await ddb.send(
    new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
      FilterExpression: filters.length > 0 ? filters.join(" AND ") : undefined,
      ExpressionAttributeNames: input.action ? { "#action": "action" } : undefined,
      ExpressionAttributeValues: exprValues,
      ExclusiveStartKey: input.cursor ? decodeCursor(input.cursor) : undefined,
      ScanIndexForward: false,
      Limit: limit
    })
  );

  return {
    data: (out.Items ?? []).map((item) => fromItem(item as Record<string, unknown>)),
    page: {
      limit,
      nextCursor: encodeCursor(out.LastEvaluatedKey as Record<string, unknown> | undefined)
    }
  };
}

export const __auditTestHooks = {
  setWriteAuditEventOverride(fn: ((input: AuditEventInput) => Promise<void>) | null): void {
    testWriteAuditEventOverride = fn;
  },
  /** No-op override — silently discards audit writes in integration tests. */
  suppressWrites(): void {
    testWriteAuditEventOverride = async () => undefined;
  },
  reset(): void {
    testWriteAuditEventOverride = null;
  }
};
