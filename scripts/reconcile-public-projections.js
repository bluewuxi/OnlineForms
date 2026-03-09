/* eslint-disable no-console */
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, QueryCommand, PutCommand, DeleteCommand, GetCommand } = require("@aws-sdk/lib-dynamodb");

const tableName = process.env.ONLINEFORMS_TABLE || "OnlineFormsMain";
const tenantId = process.env.TENANT_ID;

if (!tenantId) {
  console.error("TENANT_ID is required. Example: TENANT_ID=ten_demo npm run reconcile:projections");
  process.exit(1);
}

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

function tenantPk(id) {
  return `TENANT#${id}`;
}

function coursePublicSk(courseId) {
  return `COURSE_PUBLIC#${courseId}`;
}

async function getTenantCode(id) {
  const out = await ddb.send(
    new GetCommand({
      TableName: tableName,
      Key: { PK: tenantPk(id), SK: "PROFILE" }
    })
  );
  const item = out.Item || {};
  if (typeof item.tenantCode !== "string" || !item.tenantCode.trim()) {
    throw new Error(`Tenant profile for ${id} is missing tenantCode.`);
  }
  return item.tenantCode.trim().toLowerCase();
}

async function listCourses(id) {
  const out = await ddb.send(
    new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
      ExpressionAttributeValues: {
        ":pk": tenantPk(id),
        ":sk": "COURSE#"
      }
    })
  );
  return out.Items || [];
}

function buildProjection(course, tenantCode) {
  return {
    PK: tenantPk(course.tenantId),
    SK: coursePublicSk(course.courseId),
    projectionVersion: 1,
    entityType: "COURSE_PUBLIC",
    tenantId: course.tenantId,
    tenantCode,
    courseId: course.courseId,
    title: course.title,
    shortDescription: course.shortDescription,
    fullDescription: course.fullDescription,
    imageUrl: course.imageAssetId ? `https://cdn.onlineforms.com/assets/${course.imageAssetId}` : null,
    startDate: course.startDate,
    endDate: course.endDate,
    enrollmentOpenAt: course.enrollmentOpenAt,
    enrollmentCloseAt: course.enrollmentCloseAt,
    deliveryMode: course.deliveryMode,
    pricingMode: course.pricingMode,
    status: course.status,
    publicVisible: Boolean(course.publicVisible),
    updatedAt: course.updatedAt,
    GSI2PK: `TENANTCODE#${tenantCode}#COURSES`,
    GSI2SK: `START#${course.startDate}#COURSE#${course.courseId}`
  };
}

async function main() {
  const tenantCode = await getTenantCode(tenantId);
  const courses = await listCourses(tenantId);
  let upserted = 0;
  let deleted = 0;

  for (const course of courses) {
    if (course.status === "published" && course.publicVisible === true) {
      await ddb.send(
        new PutCommand({
          TableName: tableName,
          Item: buildProjection(course, tenantCode)
        })
      );
      upserted += 1;
    } else {
      await ddb.send(
        new DeleteCommand({
          TableName: tableName,
          Key: { PK: tenantPk(tenantId), SK: coursePublicSk(course.courseId) }
        })
      );
      deleted += 1;
    }
  }

  console.log("Projection reconciliation complete.");
  console.log(`tenantId=${tenantId}`);
  console.log(`tenantCode=${tenantCode}`);
  console.log(`courses=${courses.length}`);
  console.log(`upserted=${upserted}`);
  console.log(`deleted=${deleted}`);
}

main().catch((error) => {
  console.error("Reconciliation failed:", error);
  process.exitCode = 1;
});
