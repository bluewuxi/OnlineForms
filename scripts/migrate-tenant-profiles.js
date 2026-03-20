/* eslint-disable no-console */
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, ScanCommand, UpdateCommand } = require("@aws-sdk/lib-dynamodb");

const tableName = process.env.ONLINEFORMS_TABLE || "OnlineFormsMain";
const dryRun = (process.env.MIGRATION_DRY_RUN || "true").toLowerCase() !== "false";
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

async function scanTenantProfiles() {
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
      }
    })
  );
  return out.Items || [];
}

function tenantPk(tenantId) {
  return `TENANT#${tenantId}`;
}

function buildPatch(item) {
  const hasDescription = Object.prototype.hasOwnProperty.call(item, "description");
  const hasHomePageContent = Object.prototype.hasOwnProperty.call(item, "homePageContent");
  const hasIsActive = typeof item.isActive === "boolean";
  const status = typeof item.status === "string" ? item.status.toLowerCase() : "active";
  const nextIsActive = status === "active";
  const needsStatusNormalization = item.status !== (nextIsActive ? "active" : "inactive");

  if (hasDescription && hasHomePageContent && hasIsActive && !needsStatusNormalization) {
    return null;
  }

  const now = new Date().toISOString();
  return {
    names: {
      "#updatedAt": "updatedAt",
      "#status": "status",
      "#isActive": "isActive",
      "#description": "description",
      "#homePageContent": "homePageContent"
    },
    values: {
      ":updatedAt": now,
      ":status": nextIsActive ? "active" : "inactive",
      ":isActive": nextIsActive,
      ":description": hasDescription ? item.description : null,
      ":homePageContent": hasHomePageContent ? item.homePageContent : null
    },
    updateExpression:
      "SET #updatedAt = :updatedAt, #status = :status, #isActive = :isActive, #description = :description, #homePageContent = :homePageContent"
  };
}

async function migrate() {
  const items = await scanTenantProfiles();
  let scanned = 0;
  let changed = 0;

  for (const item of items) {
    scanned += 1;
    const tenantId = item.tenantId;
    if (typeof tenantId !== "string" || tenantId.length === 0) {
      console.warn("Skipping profile missing tenantId:", item.PK);
      continue;
    }

    const patch = buildPatch(item);
    if (!patch) continue;
    changed += 1;

    if (dryRun) {
      console.log(`[dry-run] would patch tenant ${tenantId}`);
      continue;
    }

    await ddb.send(
      new UpdateCommand({
        TableName: tableName,
        Key: { PK: tenantPk(tenantId), SK: "PROFILE" },
        ConditionExpression: "attribute_exists(PK) AND attribute_exists(SK)",
        UpdateExpression: patch.updateExpression,
        ExpressionAttributeNames: patch.names,
        ExpressionAttributeValues: patch.values
      })
    );
    console.log(`patched tenant ${tenantId}`);
  }

  console.log("Tenant profile migration complete.");
  console.log(`table=${tableName}`);
  console.log(`dryRun=${dryRun}`);
  console.log(`profilesScanned=${scanned}`);
  console.log(`profilesChanged=${changed}`);
}

migrate().catch((error) => {
  console.error("Tenant profile migration failed:", error);
  process.exitCode = 1;
});
