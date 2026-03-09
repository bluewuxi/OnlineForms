import { randomUUID } from "crypto";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { ApiError } from "./errors";

export type UploadPurpose = "course_image" | "org_logo";
export type UploadContentType = "image/png" | "image/jpeg" | "image/webp";

export type CreateUploadTicketInput = {
  purpose: UploadPurpose;
  contentType: UploadContentType;
  fileName: string;
  sizeBytes: number;
};

export type UploadTicket = {
  assetId: string;
  uploadUrl: string;
  method: "PUT";
  headers: Record<string, string>;
  expiresAt: string;
  publicUrl: string;
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

function sanitizeFileName(fileName: string): string {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 255);
}

function validateInput(input: CreateUploadTicketInput): void {
  if (!["course_image", "org_logo"].includes(input.purpose)) {
    throw new ApiError(400, "VALIDATION_ERROR", "purpose must be one of course_image or org_logo.");
  }
  if (!["image/png", "image/jpeg", "image/webp"].includes(input.contentType)) {
    throw new ApiError(400, "VALIDATION_ERROR", "contentType must be one of image/png, image/jpeg, image/webp.");
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

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: input.contentType,
    Metadata: {
      tenantid: tenantId,
      purpose: input.purpose
    }
  });
  const uploadUrl = await getSignedUrl(s3, command, { expiresIn: expiresInSeconds });

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
    method: "PUT",
    headers: {
      "Content-Type": input.contentType
    },
    expiresAt,
    publicUrl
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
  return fromItem(out.Item as Record<string, unknown>);
}

export async function assertAssetBindable(
  tenantId: string,
  assetId: string,
  purpose: UploadPurpose
): Promise<Asset> {
  const asset = await getOrgAsset(tenantId, assetId);
  if (asset.purpose !== purpose) {
    throw new ApiError(409, "CONFLICT", `Asset purpose mismatch. Expected ${purpose}.`);
  }
  if (asset.status !== "uploaded" && asset.status !== "upload_pending") {
    throw new ApiError(409, "CONFLICT", "Asset is not in a bindable status.");
  }
  return asset;
}
