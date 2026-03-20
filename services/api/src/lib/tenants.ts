import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, ScanCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { assertAssetBindable } from "./assets";
import { resolveTenantIdByCode } from "./courses";
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
  tenantId: string;
  tenantCode: string;
  displayName: string;
  description: string | null;
  isActive: boolean;
};

export type PublicTenantHome = {
  tenantCode: string;
  displayName: string;
  description: string | null;
  homePageContent: string | null;
  isActive: boolean;
  branding: {
    logoAssetId: string | null;
  };
  links: {
    publishedCourses: string;
  };
};

export type UpdateTenantProfileInput = {
  displayName?: string;
  description?: string | null;
  isActive?: boolean;
  homePageContent?: string | null;
};

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const tableName = process.env.ONLINEFORMS_TABLE ?? "OnlineFormsMain";
const MAX_DISPLAY_NAME_LENGTH = 120;
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

  if (Object.prototype.hasOwnProperty.call(input, "displayName")) {
    if (typeof input.displayName === "string") {
      const displayName = input.displayName.trim();
      if (displayName.length === 0) {
        details.push({ field: "displayName", issue: "Cannot be empty." });
      } else if (displayName.length > MAX_DISPLAY_NAME_LENGTH) {
        details.push({
          field: "displayName",
          issue: `Must be at most ${MAX_DISPLAY_NAME_LENGTH} characters.`
        });
      } else {
        out.displayName = displayName;
      }
    } else {
      details.push({ field: "displayName", issue: "Must be a string." });
    }
  }

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
      const tenantId = asString(item.tenantId);
      const tenantCode = asString(item.tenantCode);
      const displayName = asString(item.displayName);
      if (!tenantId || !tenantCode || !displayName) return null;
      const isActive = resolveIsActive(item);
      return {
        tenantId,
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

export async function getPublicTenantHomeByCode(tenantCode: string): Promise<PublicTenantHome> {
  const normalizedTenantCode = normalizeTenantCode(tenantCode);
  const tenantId = await resolveTenantIdByCode(normalizedTenantCode);
  const profile = await getTenantProfile(tenantId);
  if (!profile.isActive) {
    throw new ApiError(404, "NOT_FOUND", "Tenant not found.");
  }
  return {
    tenantCode: profile.tenantCode,
    displayName: profile.displayName,
    description: profile.description,
    homePageContent: profile.homePageContent,
    isActive: profile.isActive,
    branding: profile.branding,
    links: {
      publishedCourses: `/v1/public/${profile.tenantCode}/courses`
    }
  };
}

export async function listInternalTenantProfiles(limit = 100): Promise<TenantProfile[]> {
  const normalizedLimit = Number.isInteger(limit) && limit > 0 ? Math.min(limit, 200) : 100;
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
      const tenantId = asString(item.tenantId);
      if (!tenantId) return null;
      return toTenantProfile(tenantId, item);
    })
    .filter((item): item is TenantProfile => item !== null)
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

  if (Object.prototype.hasOwnProperty.call(patch, "displayName")) {
    names["#displayName"] = "displayName";
    values[":displayName"] = patch.displayName;
    sets.push("#displayName = :displayName");
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
