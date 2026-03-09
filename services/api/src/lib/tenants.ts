import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { assertAssetBindable } from "./assets";
import { ApiError } from "./errors";

export type TenantBranding = {
  tenantId: string;
  logoAssetId: string | null;
  updatedAt: string;
};

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const tableName = process.env.ONLINEFORMS_TABLE ?? "OnlineFormsMain";

function tenantPk(tenantId: string): string {
  return `TENANT#${tenantId}`;
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
