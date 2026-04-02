import test from "node:test";
import assert from "node:assert/strict";
import { GetCommand, QueryCommand, TransactWriteCommand } from "@aws-sdk/lib-dynamodb";
import { __coursesTestHooks } from "../services/api/src/lib/courses";
import { __formSchemasTestHooks } from "../services/api/src/lib/formSchemas";
import { ApiError } from "../services/api/src/lib/errors";
import {
  __submissionsTestHooks,
  createPublicEnrollment,
  getOrgSubmission,
  listOrgSubmissions
} from "../services/api/src/lib/submissions";

function asApiError(error: unknown): ApiError {
  assert.ok(error instanceof ApiError);
  return error;
}

test.afterEach(() => {
  __coursesTestHooks.reset();
  __formSchemasTestHooks.reset();
  __submissionsTestHooks.reset();
});

test("createPublicEnrollment uses a single transaction for idempotency and submission writes", async () => {
  __coursesTestHooks.setResolveTenantIdByCodeOverride(async () => "ten_001");
  __coursesTestHooks.setPublicCourseDetailOverride(async () => ({
    id: "crs_001",
    title: "Intro to AI",
    shortDescription: "Foundations course",
    imageUrl: null,
    startDate: "2026-04-01",
    endDate: "2026-04-28",
    deliveryMode: "online",
    pricingMode: "free",
    locationText: null,
    enrollmentOpenAt: "2026-03-10T00:00:00Z",
    enrollmentCloseAt: "2026-03-31T23:59:59Z",
    enrollmentOpenNow: true,
    enrollmentStatus: "open",
    links: {
      detail: "/v1/public/std-school/courses/crs_001",
      enrollmentForm: "/v1/public/std-school/courses/crs_001/form"
    },
    fullDescription: "Detailed syllabus",
    capacity: 120,
    formAvailable: true,
    formVersion: 1,
    formSchema: {
      version: 1,
      fields: []
    }
  }));
  __formSchemasTestHooks.setGetCourseFormSchemaVersionOverride(async () => ({
    formId: "frm_001",
    version: 1,
    tenantId: "ten_001",
    courseId: "crs_001",
    status: "active",
    fields: [
      {
        fieldId: "email",
        type: "email",
        label: "Email",
        required: true,
        displayOrder: 1
      }
    ],
    createdAt: "2026-03-10T00:00:00Z",
    updatedAt: "2026-03-10T00:00:00Z"
  }));

  const commands: object[] = [];
  __submissionsTestHooks.setDdbSendOverride(async (command) => {
    commands.push(command);
    if (command instanceof TransactWriteCommand) {
      return {};
    }
    if (command instanceof GetCommand) {
      if ((command.input.Key as { SK?: string }).SK === "MAP") {
        return { Item: { tenantId: "ten_001", status: "active" } };
      }
      throw new Error("Unexpected GetCommand.");
    }
    throw new Error(`Unexpected command: ${(command as { constructor?: { name?: string } }).constructor?.name}`);
  });

  const result = await createPublicEnrollment("std-school", "crs_001", "3c579f90-4962-4a49-9ced-e6a37f63500a", {
    formVersion: 1,
    answers: {
      email: "alice@example.com"
    }
  });

  assert.equal(result.status, "submitted");
  assert.equal(commands.filter((command) => command instanceof TransactWriteCommand).length, 1);
});

test("createPublicEnrollment persists applicant identity derived from schema answers", async () => {
  __coursesTestHooks.setResolveTenantIdByCodeOverride(async () => "ten_001");
  __coursesTestHooks.setPublicCourseDetailOverride(async () => ({
    id: "crs_001",
    title: "Intro to AI",
    shortDescription: "Foundations course",
    imageUrl: null,
    startDate: "2026-04-01",
    endDate: "2026-04-28",
    deliveryMode: "online",
    pricingMode: "free",
    locationText: null,
    enrollmentOpenAt: "2026-03-10T00:00:00Z",
    enrollmentCloseAt: "2026-03-31T23:59:59Z",
    enrollmentOpenNow: true,
    enrollmentStatus: "open",
    links: {
      detail: "/v1/public/std-school/courses/crs_001",
      enrollmentForm: "/v1/public/std-school/courses/crs_001/form"
    },
    fullDescription: "Detailed syllabus",
    capacity: 120,
    formAvailable: true,
    formVersion: 1,
    formSchema: {
      version: 1,
      fields: []
    }
  }));
  __formSchemasTestHooks.setGetCourseFormSchemaVersionOverride(async () => ({
    formId: "frm_001",
    version: 1,
    tenantId: "ten_001",
    courseId: "crs_001",
    status: "active",
    fields: [
      {
        fieldId: "first_name",
        type: "short_text",
        label: "First name",
        required: true,
        displayOrder: 1
      },
      {
        fieldId: "last_name",
        type: "short_text",
        label: "Last name",
        required: true,
        displayOrder: 2
      },
      {
        fieldId: "email",
        type: "email",
        label: "Email",
        required: true,
        displayOrder: 3
      }
    ],
    createdAt: "2026-03-10T00:00:00Z",
    updatedAt: "2026-03-10T00:00:00Z"
  }));

  let persistedApplicant: Record<string, unknown> | undefined;
  __submissionsTestHooks.setDdbSendOverride(async (command) => {
    if (command instanceof TransactWriteCommand) {
      const items = command.input.TransactItems ?? [];
      persistedApplicant = items[1]?.Put?.Item?.applicant as Record<string, unknown> | undefined;
      return {};
    }
    if (command instanceof GetCommand) {
      const key = command.input.Key as { SK?: string };
      if (key.SK === "MAP") {
        return { Item: { tenantId: "ten_001", status: "active" } };
      }
    }
    throw new Error(`Unexpected command: ${(command as { constructor?: { name?: string } }).constructor?.name}`);
  });

  await createPublicEnrollment("std-school", "crs_001", "3c579f90-4962-4a49-9ced-e6a37f63500a", {
    formVersion: 1,
    answers: {
      first_name: "Alice",
      last_name: "Learner",
      email: "alice@example.com"
    }
  });

  assert.deepEqual(persistedApplicant, {
    firstName: "Alice",
    lastName: "Learner",
    email: "alice@example.com"
  });
});

test("createPublicEnrollment replays prior success when transaction collides on the same idempotency key", async () => {
  __coursesTestHooks.setResolveTenantIdByCodeOverride(async () => "ten_001");
  __coursesTestHooks.setPublicCourseDetailOverride(async () => ({
    id: "crs_001",
    title: "Intro to AI",
    shortDescription: "Foundations course",
    imageUrl: null,
    startDate: "2026-04-01",
    endDate: "2026-04-28",
    deliveryMode: "online",
    pricingMode: "free",
    locationText: null,
    enrollmentOpenAt: "2026-03-10T00:00:00Z",
    enrollmentCloseAt: "2026-03-31T23:59:59Z",
    enrollmentOpenNow: true,
    enrollmentStatus: "open",
    links: {
      detail: "/v1/public/std-school/courses/crs_001",
      enrollmentForm: "/v1/public/std-school/courses/crs_001/form"
    },
    fullDescription: "Detailed syllabus",
    capacity: 120,
    formAvailable: true,
    formVersion: 1,
    formSchema: {
      version: 1,
      fields: []
    }
  }));
  __formSchemasTestHooks.setGetCourseFormSchemaVersionOverride(async () => ({
    formId: "frm_001",
    version: 1,
    tenantId: "ten_001",
    courseId: "crs_001",
    status: "active",
    fields: [
      {
        fieldId: "email",
        type: "email",
        label: "Email",
        required: true,
        displayOrder: 1
      }
    ],
    createdAt: "2026-03-10T00:00:00Z",
    updatedAt: "2026-03-10T00:00:00Z"
  }));

  const replay = {
    submissionId: "sub_existing",
    status: "submitted" as const,
    submittedAt: "2026-03-25T00:00:00.000Z",
    tenantCode: "std-school",
    courseId: "crs_001",
    courseTitle: "Intro to AI",
    links: {
      tenantHome: "/v1/public/std-school/tenant-home",
      course: "/v1/public/std-school/courses/crs_001"
    }
  };
  let seenRequestHash: string | undefined;

  __submissionsTestHooks.setDdbSendOverride(async (command) => {
    if (command instanceof TransactWriteCommand) {
      const items = command.input.TransactItems ?? [];
      const idempotencyItem = items[0]?.Put?.Item as { requestHash?: string } | undefined;
      seenRequestHash = idempotencyItem?.requestHash;
      const error = new Error("transaction canceled");
      error.name = "TransactionCanceledException";
      throw error;
    }
    if (command instanceof GetCommand) {
      const key = command.input.Key as { PK?: string; SK?: string };
      if (key.SK === "MAP") {
        return { Item: { tenantId: "ten_001", status: "active" } };
      }
      if (typeof key.SK === "string" && key.SK.startsWith("IDEMP#")) {
        return {
          Item: {
            requestHash: seenRequestHash,
            responseSnapshot: replay
          }
        };
      }
    }
    throw new Error(`Unexpected command: ${(command as { constructor?: { name?: string } }).constructor?.name}`);
  });

  const result = await createPublicEnrollment("std-school", "crs_001", "3c579f90-4962-4a49-9ced-e6a37f63500a", {
    formVersion: 1,
    answers: {
      email: "alice@example.com"
    }
  });

  assert.deepEqual(result, replay);
});

test("createPublicEnrollment rejects reused idempotency key when the prior request hash differs", async () => {
  __coursesTestHooks.setResolveTenantIdByCodeOverride(async () => "ten_001");
  __coursesTestHooks.setPublicCourseDetailOverride(async () => ({
    id: "crs_001",
    title: "Intro to AI",
    shortDescription: "Foundations course",
    imageUrl: null,
    startDate: "2026-04-01",
    endDate: "2026-04-28",
    deliveryMode: "online",
    pricingMode: "free",
    locationText: null,
    enrollmentOpenAt: "2026-03-10T00:00:00Z",
    enrollmentCloseAt: "2026-03-31T23:59:59Z",
    enrollmentOpenNow: true,
    enrollmentStatus: "open",
    links: {
      detail: "/v1/public/std-school/courses/crs_001",
      enrollmentForm: "/v1/public/std-school/courses/crs_001/form"
    },
    fullDescription: "Detailed syllabus",
    capacity: 120,
    formAvailable: true,
    formVersion: 1,
    formSchema: {
      version: 1,
      fields: []
    }
  }));
  __formSchemasTestHooks.setGetCourseFormSchemaVersionOverride(async () => ({
    formId: "frm_001",
    version: 1,
    tenantId: "ten_001",
    courseId: "crs_001",
    status: "active",
    fields: [
      {
        fieldId: "email",
        type: "email",
        label: "Email",
        required: true,
        displayOrder: 1
      }
    ],
    createdAt: "2026-03-10T00:00:00Z",
    updatedAt: "2026-03-10T00:00:00Z"
  }));

  __submissionsTestHooks.setDdbSendOverride(async (command) => {
    if (command instanceof TransactWriteCommand) {
      const error = new Error("transaction canceled");
      error.name = "TransactionCanceledException";
      throw error;
    }
    if (command instanceof GetCommand) {
      const key = command.input.Key as { PK?: string; SK?: string };
      if (key.SK === "MAP") {
        return { Item: { tenantId: "ten_001", status: "active" } };
      }
      if (typeof key.SK === "string" && key.SK.startsWith("IDEMP#")) {
        return {
          Item: {
            requestHash: "sha256:different",
            responseSnapshot: {
              submissionId: "sub_existing",
              status: "submitted",
              submittedAt: "2026-03-25T00:00:00.000Z"
            }
          }
        };
      }
    }
    throw new Error(`Unexpected command: ${(command as { constructor?: { name?: string } }).constructor?.name}`);
  });

  await assert.rejects(
    () =>
      createPublicEnrollment("std-school", "crs_001", "3c579f90-4962-4a49-9ced-e6a37f63500a", {
        formVersion: 1,
        answers: {
          email: "alice@example.com"
        }
      }),
    (error: unknown) => {
      const apiError = asApiError(error);
      assert.equal(apiError.statusCode, 409);
      assert.equal(apiError.code, "CONFLICT");
      assert.match(apiError.message, /different request body/i);
      return true;
    }
  );
});

test("getOrgSubmission derives applicantSummary from stored applicant identity", async () => {
  __submissionsTestHooks.setDdbSendOverride(async (command) => {
    if (command instanceof GetCommand) {
      return {
        Item: {
          submissionId: "sub_001",
          tenantId: "ten_001",
          tenantCode: "std-school",
          courseId: "crs_001",
          formId: "frm_001",
          formVersion: 1,
          status: "submitted",
          applicant: {
            firstName: "Alice",
            lastName: "Learner",
            email: "alice@example.com"
          },
          answers: {},
          submittedAt: "2026-03-25T00:00:00.000Z",
          reviewedAt: null,
          reviewedBy: null,
          createdAt: "2026-03-25T00:00:00.000Z",
          updatedAt: "2026-03-25T00:00:00.000Z"
        }
      };
    }
    throw new Error(`Unexpected command: ${(command as { constructor?: { name?: string } }).constructor?.name}`);
  });

  const result = await getOrgSubmission("ten_001", "sub_001");
  assert.equal(result.applicantSummary?.email, "alice@example.com");
  assert.equal(result.applicantSummary?.name, "Alice Learner");
});

test("getOrgSubmission uses applicant.name when a full-name field was persisted", async () => {
  __submissionsTestHooks.setDdbSendOverride(async (command) => {
    if (command instanceof GetCommand) {
      return {
        Item: {
          submissionId: "sub_002",
          tenantId: "ten_001",
          tenantCode: "std-school",
          courseId: "crs_001",
          formId: "frm_001",
          formVersion: 1,
          status: "submitted",
          applicant: {
            name: "Alice Learner",
            email: "alice@example.com"
          },
          answers: {},
          submittedAt: "2026-03-25T00:00:00.000Z",
          reviewedAt: null,
          reviewedBy: null,
          createdAt: "2026-03-25T00:00:00.000Z",
          updatedAt: "2026-03-25T00:00:00.000Z"
        }
      };
    }
    throw new Error(`Unexpected command: ${(command as { constructor?: { name?: string } }).constructor?.name}`);
  });

  const result = await getOrgSubmission("ten_001", "sub_002");
  assert.equal(result.applicantSummary?.email, "alice@example.com");
  assert.equal(result.applicantSummary?.name, "Alice Learner");
});

test("listOrgSubmissions uses GSI1 with key-based cursor for tenant-wide listing", async () => {
  let seenIndexName: string | undefined;
  let seenExclusiveStartKey: Record<string, unknown> | undefined;
  const nextKey = {
    GSI1PK: "TENANT#ten_001#SUBMISSIONS",
    GSI1SK: "SUBMITTED#2026-03-24T00:00:00.000Z#SUBMISSION#sub_002",
    PK: "TENANT#ten_001",
    SK: "SUBMISSION#sub_002"
  };

  __submissionsTestHooks.setDdbSendOverride(async (command) => {
    if (command instanceof QueryCommand) {
      seenIndexName = command.input.IndexName;
      seenExclusiveStartKey = command.input.ExclusiveStartKey as Record<string, unknown> | undefined;
      return {
        Items: [
          {
            submissionId: "sub_001",
            tenantId: "ten_001",
            tenantCode: "std-school",
            courseId: "crs_001",
            formId: "frm_001",
            formVersion: 1,
            status: "submitted",
            applicant: { email: "alice@example.com" },
            answers: {},
            submittedAt: "2026-03-25T00:00:00.000Z",
            reviewedAt: null,
            reviewedBy: null,
            createdAt: "2026-03-25T00:00:00.000Z",
            updatedAt: "2026-03-25T00:00:00.000Z"
          }
        ],
        LastEvaluatedKey: nextKey
      };
    }
    throw new Error(`Unexpected command: ${(command as { constructor?: { name?: string } }).constructor?.name}`);
  });

  const result = await listOrgSubmissions("ten_001", { limit: 1 });
  assert.equal(seenIndexName, "GSI1");
  assert.equal(seenExclusiveStartKey, undefined);
  assert.equal(result.data.length, 1);
  assert.equal(result.page.limit, 1);
  assert.equal(
    result.page.nextCursor,
    Buffer.from(JSON.stringify(nextKey), "utf-8").toString("base64")
  );
});

test("listOrgSubmissions uses GSI3 when filtering by courseId", async () => {
  let seenIndexName: string | undefined;
  let seenPartitionKey: unknown;
  const cursor = Buffer.from(
    JSON.stringify({
      GSI3PK: "TENANT#ten_001#COURSE#crs_001#SUBMISSIONS",
      GSI3SK: "SUBMITTED#2026-03-24T00:00:00.000Z#SUBMISSION#sub_002"
    }),
    "utf-8"
  ).toString("base64");

  __submissionsTestHooks.setDdbSendOverride(async (command) => {
    if (command instanceof QueryCommand) {
      seenIndexName = command.input.IndexName;
      seenPartitionKey = command.input.ExpressionAttributeValues?.[":pk"];
      return {
        Items: [],
        LastEvaluatedKey: undefined
      };
    }
    throw new Error(`Unexpected command: ${(command as { constructor?: { name?: string } }).constructor?.name}`);
  });

  const result = await listOrgSubmissions("ten_001", {
    courseId: "crs_001",
    limit: 20,
    cursor
  });
  assert.equal(seenIndexName, "GSI3");
  assert.equal(seenPartitionKey, "TENANT#ten_001#COURSE#crs_001#SUBMISSIONS");
  assert.equal(result.page.nextCursor, null);
  assert.deepEqual(result.data, []);
});
