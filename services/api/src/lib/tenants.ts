import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, ScanCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { assertAssetBindable } from "./assets";
import { ApiError } from "./errors";
import { normalizeTenantCode } from "./tenantCodes";

export type TenantBranding = {
  tenantId: string;
  logoAssetId: string | null;
  updatedAt: string;
};

export type TenantProfile = {
  tenantId: string;
  tenantCode: string;
  displayName: string;
  description: string | null;
  isActive: boolean;
  homePageContent: string | null;
  branding: {
    logoAssetId: string | null;
  };
  createdAt: string | null;
  updatedAt: string;
};

export type PublicTenantDirectoryItem = {
  tenantCode: string;
  displayName: string;
  description: string | null;
  isActive: boolean;
};

export type UpdateTenantProfileInput = {
  description?: string | null;
  isActive?: boolean;
  homePageContent?: string | null;
};

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const tableName = process.env.ONLINEFORMS_TABLE ?? "OnlineFormsMain";
const MAX_DESCRIPTION_LENGTH = 500;
const MAX_HOME_PAGE_CONTENT_LENGTH = 8000;

function tenantPk(tenantId: string): string {
  return `TENANT#${tenantId}`;
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function resolveIsActive(item: Record<string, unknown>): boolean {
  if (typeof item.isActive === "boolean") return item.isActive;
  if (typeof item.status === "string") return item.status.toLowerCase() === "active";
  return true;
}

export function normalizeTenantProfilePatch(input: UpdateTenantProfileInput): UpdateTenantProfileInput {
  const out: UpdateTenantProfileInput = {};
  const details: Array<{ field?: string; issue: string }> = [];

  if (Object.prototype.hasOwnProperty.call(input, "description")) {
    if (input.description == null) {
      out.description = null;
    } else if (typeof input.description === "string") {
      const description = input.description.trim();
      if (description.length > MAX_DESCRIPTION_LENGTH) {
        details.push({
          field: "description",
          issue: `Must be at most ${MAX_DESCRIPTION_LENGTH} characters.`
        });
      } else {
        out.description = description.length > 0 ? description : null;
      }
    } else {
      details.push({ field: "description", issue: "Must be a string or null." });
    }
  }

  if (Object.prototype.hasOwnProperty.call(input, "isActive")) {
    if (typeof input.isActive !== "boolean") {
      details.push({ field: "isActive", issue: "Must be a boolean." });
    } else {
      out.isActive = input.isActive;
    }
  }

  if (Object.prototype.hasOwnProperty.call(input, "homePageContent")) {
    if (input.homePageContent == null) {
      out.homePageContent = null;
    } else if (typeof input.homePageContent === "string") {
      const homePageContent = input.homePageContent.trim();
      if (homePageContent.length > MAX_HOME_PAGE_CONTENT_LENGTH) {
        details.push({
          field: "homePageContent",
          issue: `Must be at most ${MAX_HOME_PAGE_CONTENT_LENGTH} characters.`
        });
      } else {
        out.homePageContent = homePageContent.length > 0 ? homePageContent : null;
      }
    } else {
      details.push({ field: "homePageContent", issue: "Must be a string or null." });
    }
  }

  if (details.length > 0) {
    throw new ApiError(400, "VALIDATION_ERROR", "Invalid tenant profile update payload.", details);
  }

  return out;
}

function toTenantProfile(tenantId: string, item: Record<string, unknown>): TenantProfile {
  const tenantCode = asString(item.tenantCode);
  const displayName = asString(item.displayName);
  if (!tenantCode || !displayName) {
    throw new ApiError(409, "CONFLICT", "Tenant profile is missing required fields.");
  }

  const branding = item.branding as Record<string, unknown> | undefined;
  return {
    tenantId,
    tenantCode: normalizeTenantCode(tenantCode, {
      statusCode: 409,
      code: "CONFLICT",
      messagePrefix: "Tenant profile has invalid tenantCode."
    }),
    displayName,
    description: asString(item.description),
    isActive: resolveIsActive(item),
    homePageContent: asString(item.homePageContent),
    branding: {
      logoAssetId: asString(branding?.logoAssetId)
    },
    createdAt: asString(item.createdAt),
    updatedAt: asString(item.updatedAt) ?? new Date().toISOString()
  };
}

export async function getTenantProfile(tenantId: string): Promise<TenantProfile> {
  const out = await ddb.send(
    new GetCommand({
      TableName: tableName,
      Key: { PK: tenantPk(tenantId), SK: "PROFILE" }
    })
  );
  if (!out.Item) {
    throw new ApiError(404, "NOT_FOUND", "Tenant profile not found.");
  }
  return toTenantProfile(tenantId, out.Item as Record<string, unknown>);
}

export async function listPublicTenantDirectory(limit = 50): Promise<PublicTenantDirectoryItem[]> {
  const normalizedLimit = Number.isInteger(limit) && limit > 0 ? Math.min(limit, 100) : 50;
  const out = await ddb.send(
    new ScanCommand({
      TableName: tableName,
      FilterExpression: "#sk = :profileSk AND #entityType = :entityType",
      ExpressionAttributeNames: {
        "#sk": "SK",
        "#entityType": "entityType"
      },
      ExpressionAttributeValues: {
        ":profileSk": "PROFILE",
        ":entityType": "TENANT"
      },
      Limit: normalizedLimit
    })
  );

  const rows = (out.Items ?? []).map((item) => item as Record<string, unknown>);
  return rows
    .map((item) => {
      const tenantCode = asString(item.tenantCode);
      const displayName = asString(item.displayName);
      if (!tenantCode || !displayName) return null;
      const isActive = resolveIsActive(item);
      return {
        tenantCode: normalizeTenantCode(tenantCode, {
          statusCode: 409,
          code: "CONFLICT",
          messagePrefix: "Tenant profile has invalid tenantCode."
        }),
        displayName,
        description: asString(item.description),
        isActive
      } as PublicTenantDirectoryItem;
    })
    .filter((item): item is PublicTenantDirectoryItem => item !== null && item.isActive)
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
}

export async function updateTenantBranding(
  tenantId: string,
  logoAssetId: string | null
): Promise<TenantBranding> {
  if (logoAssetId) {
    await assertAssetBindable(tenantId, logoAssetId, "org_logo");
  }
  const now = new Date().toISOString();

  const out = await ddb.send(
    new UpdateCommand({
      TableName: tableName,
      Key: { PK: tenantPk(tenantId), SK: "PROFILE" },
      ConditionExpression: "attribute_exists(PK) AND attribute_exists(SK)",
      UpdateExpression: "SET #branding.#logoAssetId = :logoAssetId, #updatedAt = :updatedAt",
      ExpressionAttributeNames: {
        "#branding": "branding",
        "#logoAssetId": "logoAssetId",
        "#updatedAt": "updatedAt"
      },
      ExpressionAttributeValues: {
        ":logoAssetId": logoAssetId,
        ":updatedAt": now
      }
    })
  );

  if (!out) {
    throw new ApiError(404, "NOT_FOUND", "Tenant profile not found.");
  }

  return {
    tenantId,
    logoAssetId,
    updatedAt: now
  };
}

export async function updateTenantProfile(
  tenantId: string,
  input: UpdateTenantProfileInput
): Promise<TenantProfile> {
  const patch = normalizeTenantProfilePatch(input);
  if (Object.keys(patch).length === 0) {
    throw new ApiError(400, "VALIDATION_ERROR", "At least one tenant profile field must be provided.");
  }

  const now = new Date().toISOString();
  const names: Record<string, string> = { "#updatedAt": "updatedAt" };
  const values: Record<string, unknown> = { ":updatedAt": now };
  const sets: string[] = ["#updatedAt = :updatedAt"];
  const removes: string[] = [];

  if (Object.prototype.hasOwnProperty.call(patch, "description")) {
    names["#description"] = "description";
    if (patch.description == null) {
      removes.push("#description");
    } else {
      values[":description"] = patch.description;
      sets.push("#description = :description");
    }
  }

  if (Object.prototype.hasOwnProperty.call(patch, "isActive")) {
    names["#isActive"] = "isActive";
    names["#status"] = "status";
    values[":isActive"] = patch.isActive;
    values[":status"] = patch.isActive ? "active" : "inactive";
    sets.push("#isActive = :isActive", "#status = :status");
  }

  if (Object.prototype.hasOwnProperty.call(patch, "homePageContent")) {
    names["#homePageContent"] = "homePageContent";
    if (patch.homePageContent == null) {
      removes.push("#homePageContent");
    } else {
      values[":homePageContent"] = patch.homePageContent;
      sets.push("#homePageContent = :homePageContent");
    }
  }

  const expression = `SET ${sets.join(", ")}${removes.length > 0 ? ` REMOVE ${removes.join(", ")}` : ""}`;
  const out = await ddb.send(
    new UpdateCommand({
      TableName: tableName,
      Key: { PK: tenantPk(tenantId), SK: "PROFILE" },
      ConditionExpression: "attribute_exists(PK) AND attribute_exists(SK)",
      UpdateExpression: expression,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
      ReturnValues: "ALL_NEW"
    })
  );

  if (!out.Attributes) {
    throw new ApiError(404, "NOT_FOUND", "Tenant profile not found.");
  }

  return toTenantProfile(tenantId, out.Attributes as Record<string, unknown>);
}
