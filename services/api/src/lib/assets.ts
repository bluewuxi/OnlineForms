import { randomUUID } from "crypto";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createPresignedPost } from "@aws-sdk/s3-presigned-post";
import { ApiError } from "./errors";

export type UploadPurpose = "course_image" | "org_logo";
export type UploadContentType = "image/png" | "image/jpeg" | "image/webp" | "image/svg+xml";

export type CreateUploadTicketInput = {
  purpose: UploadPurpose;
  contentType: UploadContentType;
  fileName: string;
  sizeBytes: number;
};

export type UploadTicket = {
  assetId: string;
  uploadUrl: string;
  method: "POST";
  fields: Record<string, string>;
  expiresAt: string;
  publicUrl: string;
  asset: {
    id: string;
    purpose: UploadPurpose;
    status: AssetStatus;
    fileName: string;
    contentType: UploadContentType;
    sizeBytes: number;
    publicUrl: string;
  };
};

export type AssetStatus = "upload_pending" | "uploaded";

export type Asset = {
  id: string;
  tenantId: string;
  purpose: UploadPurpose;
  contentType: UploadContentType;
  fileName: string;
  sizeBytes: number;
  storageKey: string;
  status: AssetStatus;
  createdAt: string;
  updatedAt: string;
  publicUrl: string;
};

const s3 = new S3Client({});
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const tableName = process.env.ONLINEFORMS_TABLE ?? "OnlineFormsMain";
let testCreateUploadTicketOverride:
  | ((tenantId: string, input: CreateUploadTicketInput) => Promise<UploadTicket>)
  | null = null;
let testResolveAssetPublicUrlOverride:
  | ((tenantId: string, assetId: string | null) => Promise<string | null>)
  | null = null;
let testResolveStoredAssetUrlOverride:
  | ((item: Record<string, unknown>) => Promise<string>)
  | null = null;

function tenantPk(tenantId: string): string {
  return `TENANT#${tenantId}`;
}

function assetSk(assetId: string): string {
  return `ASSET#${assetId}`;
}

function fromItem(item: Record<string, unknown>): Asset {
  return {
    id: item.assetId as string,
    tenantId: item.tenantId as string,
    purpose: item.purpose as UploadPurpose,
    contentType: item.contentType as UploadContentType,
    fileName: item.fileName as string,
    sizeBytes: item.sizeBytes as number,
    storageKey: item.storageKey as string,
    status: item.status as AssetStatus,
    createdAt: item.createdAt as string,
    updatedAt: item.updatedAt as string,
    publicUrl: item.publicUrl as string
  };
}

async function resolveStoredAssetUrl(item: Record<string, unknown>): Promise<string> {
  if (testResolveStoredAssetUrlOverride) {
    return testResolveStoredAssetUrlOverride(item);
  }

  const bucket = process.env.ONLINEFORMS_ASSETS_BUCKET;
  const storageKey = item.storageKey as string | undefined;
  if (bucket && storageKey) {
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: storageKey
    });
    return getSignedUrl(s3, command, { expiresIn: 3600 });
  }

  return (item.publicUrl as string) ?? "";
}

function sanitizeFileName(fileName: string): string {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 255);
}

function validateInput(input: CreateUploadTicketInput): void {
  if (!["course_image", "org_logo"].includes(input.purpose)) {
    throw new ApiError(400, "VALIDATION_ERROR", "purpose must be one of course_image or org_logo.");
  }
  if (!["image/png", "image/jpeg", "image/webp", "image/svg+xml"].includes(input.contentType)) {
    throw new ApiError(400, "VALIDATION_ERROR", "contentType must be one of image/png, image/jpeg, image/webp, image/svg+xml.");
  }
  if (!input.fileName?.trim()) {
    throw new ApiError(400, "VALIDATION_ERROR", "fileName is required.");
  }
  if (!Number.isInteger(input.sizeBytes) || input.sizeBytes < 1 || input.sizeBytes > 5 * 1024 * 1024) {
    throw new ApiError(400, "VALIDATION_ERROR", "sizeBytes must be an integer between 1 and 5242880.");
  }
}

export async function createUploadTicket(
  tenantId: string,
  input: CreateUploadTicketInput
): Promise<UploadTicket> {
  if (testCreateUploadTicketOverride) {
    return testCreateUploadTicketOverride(tenantId, input);
  }
  validateInput(input);

  const bucket = process.env.ONLINEFORMS_ASSETS_BUCKET;
  if (!bucket) {
    throw new ApiError(500, "INTERNAL_ERROR", "ONLINEFORMS_ASSETS_BUCKET is not configured.");
  }

  const assetId = `ast_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
  const key = `tenants/${tenantId}/assets/${assetId}-${sanitizeFileName(input.fileName)}`;
  const expiresInSeconds = 900;
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + expiresInSeconds * 1000).toISOString();

  // Presigned POST enforces conditions at S3 — content-length-range rejects oversized
  // uploads server-side regardless of what the client declared in sizeBytes.
  const { url: uploadUrl, fields } = await createPresignedPost(s3, {
    Bucket: bucket,
    Key: key,
    Conditions: [
      // Reject any upload outside 1 byte – 5 MB
      ["content-length-range", 1, 5 * 1024 * 1024],
      // Lock Content-Type and Content-Disposition to what was agreed at ticket time
      ["eq", "$Content-Type", input.contentType],
      ["eq", "$Content-Disposition", "attachment"]
    ],
    Fields: {
      "Content-Type": input.contentType,
      // Force download rather than inline render — prevents stored XSS via SVG/HTML
      "Content-Disposition": "attachment",
      "x-amz-meta-tenantid": tenantId,
      "x-amz-meta-purpose": input.purpose
    },
    Expires: expiresInSeconds
  });

  const region = process.env.AWS_REGION ?? "ap-southeast-2";
  const publicUrl = `https://${bucket}.s3.${region}.amazonaws.com/${key}`;

  await ddb.send(
    new PutCommand({
      TableName: tableName,
      Item: {
        PK: tenantPk(tenantId),
        SK: assetSk(assetId),
        entityType: "ASSET",
        tenantId,
        assetId,
        purpose: input.purpose,
        contentType: input.contentType,
        fileName: sanitizeFileName(input.fileName),
        sizeBytes: input.sizeBytes,
        storageKey: key,
        status: "upload_pending" as AssetStatus,
        createdAt: now,
        updatedAt: now,
        publicUrl
      },
      ConditionExpression: "attribute_not_exists(PK) AND attribute_not_exists(SK)"
    })
  );

  return {
    assetId,
    uploadUrl,
    method: "POST",
    fields,
    expiresAt,
    publicUrl,
    asset: {
      id: assetId,
      purpose: input.purpose,
      status: "upload_pending",
      fileName: sanitizeFileName(input.fileName),
      contentType: input.contentType,
      sizeBytes: input.sizeBytes,
      publicUrl
    }
  };
}

export async function getOrgAsset(tenantId: string, assetId: string): Promise<Asset> {
  const out = await ddb.send(
    new GetCommand({
      TableName: tableName,
      Key: {
        PK: tenantPk(tenantId),
        SK: assetSk(assetId)
      }
    })
  );

  if (!out.Item) {
    throw new ApiError(404, "NOT_FOUND", "Asset not found.");
  }
  const item = out.Item as Record<string, unknown>;
  return {
    ...fromItem(item),
    publicUrl: await resolveStoredAssetUrl(item)
  };
}

export async function resolveAssetPublicUrl(
  tenantId: string,
  assetId: string | null
): Promise<string | null> {
  if (testResolveAssetPublicUrlOverride) {
    return testResolveAssetPublicUrlOverride(tenantId, assetId);
  }
  if (!assetId) return null;
  const out = await ddb.send(
    new GetCommand({
      TableName: tableName,
      Key: {
        PK: tenantPk(tenantId),
        SK: assetSk(assetId)
      }
    })
  );

  if (!out.Item) {
    throw new ApiError(404, "NOT_FOUND", "Asset not found.");
  }

  return resolveStoredAssetUrl(out.Item as Record<string, unknown>);
}

export async function assertAssetBindable(
  tenantId: string,
  assetId: string,
  purpose: UploadPurpose
): Promise<Asset> {
  const asset = await getOrgAsset(tenantId, assetId);
  if (asset.purpose !== purpose) {
    throw new ApiError(409, "CONFLICT", `Asset purpose mismatch. Expected ${purpose}.`, [
      { field: "assetId", issue: "asset_purpose_mismatch" }
    ]);
  }
  if (asset.status !== "uploaded" && asset.status !== "upload_pending") {
    throw new ApiError(409, "CONFLICT", "Asset is not in a bindable status.", [
      { field: "assetId", issue: "asset_not_bindable" }
    ]);
  }
  return asset;
}

export const __assetsTestHooks = {
  setCreateUploadTicketOverride(
    loader: ((tenantId: string, input: CreateUploadTicketInput) => Promise<UploadTicket>) | null
  ): void {
    testCreateUploadTicketOverride = loader;
  },
  setResolveAssetPublicUrlOverride(
    loader: ((tenantId: string, assetId: string | null) => Promise<string | null>) | null
  ): void {
    testResolveAssetPublicUrlOverride = loader;
  },
  setResolveStoredAssetUrlOverride(
    loader: ((item: Record<string, unknown>) => Promise<string>) | null
  ): void {
    testResolveStoredAssetUrlOverride = loader;
  },
  reset(): void {
    testCreateUploadTicketOverride = null;
    testResolveAssetPublicUrlOverride = null;
    testResolveStoredAssetUrlOverride = null;
  }
};
