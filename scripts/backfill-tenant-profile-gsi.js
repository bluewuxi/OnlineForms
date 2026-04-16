/* eslint-disable no-console */
/**
 * Backfills GSI1PK / GSI1SK onto existing TENANT PROFILE items so they can be
 * queried via the GSI1 index instead of a full-table scan.
 *
 * Usage:
 *   node scripts/backfill-tenant-profile-gsi.js              # dry run (default)
 *   MIGRATION_DRY_RUN=false node scripts/backfill-tenant-profile-gsi.js
 */
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, ScanCommand, UpdateCommand } = require("@aws-sdk/lib-dynamodb");

const tableName = process.env.ONLINEFORMS_TABLE || "OnlineFormsMain";
const dryRun = (process.env.MIGRATION_DRY_RUN || "true").toLowerCase() !== "false";
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const TENANT_PROFILE_GSI1PK = "ENTITY_TYPE#TENANT";

async function scanTenantProfiles() {
  const items = [];
  let lastKey;
  do {
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
        ExclusiveStartKey: lastKey
      })
    );
    items.push(...(out.Items ?? []));
    lastKey = out.LastEvaluatedKey;
  } while (lastKey);
  return items;
}

async function main() {
  console.log(`Mode: ${dryRun ? "DRY RUN" : "LIVE"}`);
  console.log(`Table: ${tableName}`);

  const profiles = await scanTenantProfiles();
  console.log(`Found ${profiles.length} TENANT PROFILE item(s)`);

  let skipped = 0;
  let updated = 0;

  for (const item of profiles) {
    const { PK, SK, tenantId, GSI1PK } = item;

    if (GSI1PK === TENANT_PROFILE_GSI1PK) {
      console.log(`  SKIP  ${tenantId} — GSI keys already present`);
      skipped++;
      continue;
    }

    console.log(`  ${dryRun ? "WOULD UPDATE" : "UPDATE"} ${tenantId} (PK=${PK})`);

    if (!dryRun) {
      await ddb.send(
        new UpdateCommand({
          TableName: tableName,
          Key: { PK, SK },
          UpdateExpression: "SET GSI1PK = :gsi1pk, GSI1SK = :gsi1sk",
          ExpressionAttributeValues: {
            ":gsi1pk": TENANT_PROFILE_GSI1PK,
            ":gsi1sk": tenantId
          },
          ConditionExpression: "attribute_exists(PK) AND attribute_exists(SK)"
        })
      );
    }
    updated++;
  }

  console.log(`\nDone. ${updated} updated, ${skipped} skipped.`);
  if (dryRun) {
    console.log("Re-run with MIGRATION_DRY_RUN=false to apply changes.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
