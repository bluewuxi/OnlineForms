/* eslint-disable no-console */
/**
 * migrate-role-rename.js
 *
 * Renames the role value "platform_admin" → "platform_support" in all
 * AUTH_MEMBERSHIP items in OnlineFormsAuth.
 *
 * Two item types must be handled differently because the tenant-edge item
 * embeds the role inside the GSI1SK key attribute, which cannot be updated
 * in place — DynamoDB requires a delete + put for key attribute changes.
 *
 * Item types:
 *   User-edge  PK=USER#{userId}   SK=MEMBERSHIP#{tenantId}  — no GSI keys; safe to UpdateItem
 *   Tenant-edge PK=TENANT#{tenantId} SK=MEMBER#{userId}     — GSI1SK contains role; requires delete + put
 *
 * Usage:
 *   node scripts/migrate-role-rename.js              # dry run (default)
 *   MIGRATION_DRY_RUN=false node scripts/migrate-role-rename.js   # live run
 *
 * Environment variables:
 *   ONLINEFORMS_AUTH_TABLE  — defaults to "OnlineFormsAuth"
 *   MIGRATION_DRY_RUN       — "true" (default) or "false"
 *   AWS_REGION              — defaults to ap-southeast-2
 */

const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const {
  DynamoDBDocumentClient,
  ScanCommand,
  UpdateCommand,
  DeleteCommand,
  PutCommand,
} = require("@aws-sdk/lib-dynamodb");

const authTableName = process.env.ONLINEFORMS_AUTH_TABLE || "OnlineFormsAuth";
const dryRun = (process.env.MIGRATION_DRY_RUN || "true").toLowerCase() !== "false";
const OLD_ROLE = "platform_admin";
const NEW_ROLE = "platform_support";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

// ── helpers ──────────────────────────────────────────────────────────────────

function replaceRoleInArray(arr) {
  if (!Array.isArray(arr)) return arr;
  return arr.map((r) => (r === OLD_ROLE ? NEW_ROLE : r));
}

function needsRename(item) {
  if (item.role === OLD_ROLE) return true;
  if (Array.isArray(item.allowedRoles) && item.allowedRoles.includes(OLD_ROLE)) return true;
  return false;
}

function isUserEdge(item) {
  // PK starts with USER# and SK starts with MEMBERSHIP#
  return (
    typeof item.PK === "string" &&
    item.PK.startsWith("USER#") &&
    typeof item.SK === "string" &&
    item.SK.startsWith("MEMBERSHIP#")
  );
}

function isTenantEdge(item) {
  // PK starts with TENANT# and SK starts with MEMBER#
  return (
    typeof item.PK === "string" &&
    item.PK.startsWith("TENANT#") &&
    typeof item.SK === "string" &&
    item.SK.startsWith("MEMBER#")
  );
}

// ── scan ─────────────────────────────────────────────────────────────────────

async function scanMemberships() {
  const items = [];
  let lastKey;

  do {
    const out = await ddb.send(
      new ScanCommand({
        TableName: authTableName,
        FilterExpression: "#entityType = :entityType",
        ExpressionAttributeNames: { "#entityType": "entityType" },
        ExpressionAttributeValues: { ":entityType": "AUTH_MEMBERSHIP" },
        ExclusiveStartKey: lastKey,
      })
    );
    for (const item of out.Items || []) {
      items.push(item);
    }
    lastKey = out.LastEvaluatedKey;
  } while (lastKey);

  return items;
}

// ── update strategies ─────────────────────────────────────────────────────────

async function updateUserEdge(item) {
  // Safe to update in place — no GSI key contains the role value for this item type.
  const newAllowedRoles = replaceRoleInArray(item.allowedRoles);
  const now = new Date().toISOString();

  if (dryRun) {
    console.log(`[dry-run] UpdateItem user-edge  PK=${item.PK} SK=${item.SK}`);
    console.log(`          role: "${item.role}" → "${NEW_ROLE}"`);
    console.log(`          allowedRoles: ${JSON.stringify(item.allowedRoles)} → ${JSON.stringify(newAllowedRoles)}`);
    return;
  }

  await ddb.send(
    new UpdateCommand({
      TableName: authTableName,
      Key: { PK: item.PK, SK: item.SK },
      ConditionExpression: "attribute_exists(PK) AND attribute_exists(SK)",
      UpdateExpression:
        "SET #role = :newRole, #allowedRoles = :newAllowedRoles, #updatedAt = :now",
      ExpressionAttributeNames: {
        "#role": "role",
        "#allowedRoles": "allowedRoles",
        "#updatedAt": "updatedAt",
      },
      ExpressionAttributeValues: {
        ":newRole": NEW_ROLE,
        ":newAllowedRoles": newAllowedRoles,
        ":now": now,
      },
    })
  );
  console.log(`updated user-edge  PK=${item.PK} SK=${item.SK}`);
}

async function updateTenantEdge(item) {
  // GSI1SK = ROLE#{role}#USER#{userId} — DynamoDB key attributes cannot be updated
  // in place, so this requires a delete of the old item and a put of the new one.
  const newAllowedRoles = replaceRoleInArray(item.allowedRoles);
  const now = new Date().toISOString();

  // Reconstruct the new GSI1SK with the renamed role
  const userId = item.userId || item.SK.replace("MEMBER#", "");
  const newGsi1Sk = `ROLE#${NEW_ROLE}#USER#${userId}`;

  const newItem = {
    ...item,
    role: NEW_ROLE,
    allowedRoles: newAllowedRoles,
    updatedAt: now,
    GSI1SK: newGsi1Sk,
  };

  if (dryRun) {
    console.log(`[dry-run] Delete+Put tenant-edge  PK=${item.PK} SK=${item.SK}`);
    console.log(`          role: "${item.role}" → "${NEW_ROLE}"`);
    console.log(`          allowedRoles: ${JSON.stringify(item.allowedRoles)} → ${JSON.stringify(newAllowedRoles)}`);
    console.log(`          GSI1SK: "${item.GSI1SK}" → "${newGsi1Sk}"`);
    return;
  }

  // Delete old item first, then put new — not atomic, but safe: a failed put
  // leaves no item rather than a corrupt one (the membership can be re-seeded or
  // the invite accepted again). Log each step so failures are recoverable.
  await ddb.send(
    new DeleteCommand({
      TableName: authTableName,
      Key: { PK: item.PK, SK: item.SK },
    })
  );
  console.log(`deleted  tenant-edge  PK=${item.PK} SK=${item.SK}`);

  await ddb.send(
    new PutCommand({
      TableName: authTableName,
      Item: newItem,
    })
  );
  console.log(`re-put   tenant-edge  PK=${item.PK} SK=${item.SK} GSI1SK=${newGsi1Sk}`);
}

// ── main ─────────────────────────────────────────────────────────────────────

async function migrate() {
  console.log(`migrate-role-rename: ${OLD_ROLE} → ${NEW_ROLE}`);
  console.log(`table=${authTableName}`);
  console.log(`dryRun=${dryRun}`);
  console.log("");

  const allItems = await scanMemberships();
  const targets = allItems.filter(needsRename);

  console.log(`AUTH_MEMBERSHIP items scanned : ${allItems.length}`);
  console.log(`Items requiring rename        : ${targets.length}`);
  if (targets.length === 0) {
    console.log("Nothing to do.");
    return;
  }
  console.log("");

  let userEdgeCount = 0;
  let tenantEdgeCount = 0;
  let skippedCount = 0;

  for (const item of targets) {
    if (isUserEdge(item)) {
      await updateUserEdge(item);
      userEdgeCount++;
    } else if (isTenantEdge(item)) {
      await updateTenantEdge(item);
      tenantEdgeCount++;
    } else {
      console.warn(`skipped unrecognised item shape PK=${item.PK} SK=${item.SK}`);
      skippedCount++;
    }
  }

  console.log("");
  console.log("Migration complete.");
  console.log(`  user-edge items updated   : ${userEdgeCount}`);
  console.log(`  tenant-edge items replaced: ${tenantEdgeCount}`);
  console.log(`  unrecognised items skipped: ${skippedCount}`);
  if (dryRun) {
    console.log("");
    console.log("This was a dry run. Set MIGRATION_DRY_RUN=false to apply changes.");
  }
}

migrate().catch((error) => {
  console.error("Migration failed:", error);
  process.exitCode = 1;
});
