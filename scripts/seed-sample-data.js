/* eslint-disable no-console */
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, PutCommand } = require("@aws-sdk/lib-dynamodb");
const { normalizeTenantCodeOrThrow } = require("./tenant-code-guards");

const tableName = process.env.ONLINEFORMS_TABLE || "OnlineFormsMain";
const tenantId = process.env.SEED_TENANT_ID || "001";
const tenantCode = normalizeTenantCodeOrThrow(process.env.SEED_TENANT_CODE || "std-school", "SEED_TENANT_CODE");
const displayName = process.env.SEED_DISPLAY_NAME || "Demo School";
const tenantDescription =
  process.env.SEED_TENANT_DESCRIPTION ||
  "Demo school tenant profile used for local smoke and integration checks.";
const tenantHomePageContent =
  process.env.SEED_TENANT_HOME_PAGE_CONTENT ||
  "Welcome to Demo School. Explore our published courses and enroll online.";
const tenantIsActiveRaw = process.env.SEED_TENANT_IS_ACTIVE || "true";
const tenantIsActive = tenantIsActiveRaw.toLowerCase() !== "false";
const courseId = process.env.SEED_COURSE_ID || "std_001";
const formId = process.env.SEED_FORM_ID || "frm_001";
const courseTitle = process.env.SEED_COURSE_TITLE || "Intro to AI (Seeded)";
const shortDescription =
  process.env.SEED_SHORT_DESCRIPTION || "Seeded sample course for smoke tests";
const fullDescription =
  process.env.SEED_FULL_DESCRIPTION ||
  "Sample full description used by the seed script.";
const formVersion = 1;
const now = new Date().toISOString();

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

function tenantPk(id) {
  return `TENANT#${id}`;
}

async function put(item) {
  await ddb.send(
    new PutCommand({
      TableName: tableName,
      Item: item
    })
  );
}

async function main() {
  await put({
    PK: tenantPk(tenantId),
    SK: "PROFILE",
    entityType: "TENANT",
    tenantId,
    tenantCode,
    displayName,
    description: tenantDescription,
    isActive: tenantIsActive,
    homePageContent: tenantHomePageContent,
    status: tenantIsActive ? "active" : "inactive",
    branding: { logoAssetId: null },
    createdAt: now,
    updatedAt: now
  });

  await put({
    PK: `TENANTCODE#${tenantCode}`,
    SK: "MAP",
    entityType: "TENANT_CODE_MAP",
    tenantCode,
    tenantId,
    status: "active",
    createdAt: now,
    updatedAt: now
  });

  await put({
    PK: tenantPk(tenantId),
    SK: `COURSE#${courseId}`,
    entityType: "COURSE",
    tenantId,
    courseId,
    title: courseTitle,
    shortDescription,
    fullDescription,
    startDate: "2026-04-01",
    endDate: "2026-04-28",
    enrollmentOpenAt: "2026-03-01T00:00:00Z",
    enrollmentCloseAt: "2026-12-31T23:59:59Z",
    deliveryMode: "online",
    locationText: null,
    capacity: 120,
    status: "published",
    publicVisible: true,
    pricingMode: "free",
    paymentEnabledFlag: false,
    imageAssetId: null,
    activeFormId: formId,
    activeFormVersion: formVersion,
    createdAt: now,
    updatedAt: now,
    createdBy: "seed-script",
    updatedBy: "seed-script"
  });

  await put({
    PK: tenantPk(tenantId),
    SK: `COURSE_PUBLIC#${courseId}`,
    projectionVersion: 1,
    entityType: "COURSE_PUBLIC",
    tenantId,
    tenantCode,
    courseId,
    title: courseTitle,
    shortDescription,
    fullDescription,
    imageUrl: null,
    startDate: "2026-04-01",
    endDate: "2026-04-28",
    enrollmentOpenAt: "2026-03-01T00:00:00Z",
    enrollmentCloseAt: "2026-12-31T23:59:59Z",
    deliveryMode: "online",
    pricingMode: "free",
    status: "published",
    publicVisible: true,
    updatedAt: now,
    GSI2PK: `TENANTCODE#${tenantCode}#COURSES`,
    GSI2SK: `START#2026-04-01#COURSE#${courseId}`
  });

  await put({
    PK: tenantPk(tenantId),
    SK: `COURSE#${courseId}#FORMVER#0001`,
    entityType: "FORM_VERSION",
    tenantId,
    courseId,
    formId,
    version: formVersion,
    status: "active",
    fields: [
      {
        fieldId: "first_name",
        type: "short_text",
        label: "First Name",
        required: true,
        displayOrder: 1,
        options: [],
        validation: { minLength: 1, maxLength: 80, pattern: null }
      },
      {
        fieldId: "email",
        type: "email",
        label: "Email",
        required: true,
        displayOrder: 2,
        options: [],
        validation: {}
      },
      {
        fieldId: "consent_terms",
        type: "checkbox",
        label: "I agree to terms",
        required: true,
        displayOrder: 3,
        options: [],
        validation: {}
      }
    ],
    createdAt: now,
    updatedAt: now,
    createdBy: "seed-script",
    updatedBy: "seed-script"
  });

  console.log("Seed complete.");
  console.log(`table=${tableName}`);
  console.log(`tenantId=${tenantId}`);
  console.log(`tenantCode=${tenantCode}`);
  console.log(`displayName=${displayName}`);
  console.log(`tenantIsActive=${tenantIsActive}`);
  console.log(`courseId=${courseId}`);
  console.log(`formId=${formId}`);
  console.log(`formVersion=${formVersion}`);
}

main().catch((error) => {
  console.error("Seed failed:", error);
  process.exitCode = 1;
});
