import test from "node:test";
import assert from "node:assert/strict";
import { DeleteCommand, GetCommand, PutCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { __coursesTestHooks, setCourseStatus, type Course } from "../services/api/src/lib/courses";
import { ApiError } from "../services/api/src/lib/errors";
import { __formSchemasTestHooks } from "../services/api/src/lib/formSchemas";

function asApiError(error: unknown): ApiError {
  assert.ok(error instanceof ApiError);
  return error;
}

function draftCourse(overrides?: Partial<Course>): Course {
  return {
    id: "crs_001",
    tenantId: "ten_001",
    title: "Intro to AI",
    shortDescription: "Foundations course",
    fullDescription: "Detailed syllabus",
    startDate: "2026-04-01",
    endDate: "2026-04-28",
    enrollmentOpenAt: "2026-03-10T00:00:00Z",
    enrollmentCloseAt: "2026-03-31T23:59:59Z",
    deliveryMode: "online",
    locationText: null,
    capacity: 120,
    status: "draft",
    publicVisible: false,
    pricingMode: "free",
    paymentEnabledFlag: false,
    imageAssetId: null,
    activeFormId: "frm_001",
    activeFormVersion: 1,
    createdAt: "2026-03-10T00:00:00Z",
    updatedAt: "2026-03-10T00:00:00Z",
    createdBy: "usr_001",
    updatedBy: "usr_001",
    ...overrides
  };
}

test.afterEach(() => {
  __coursesTestHooks.reset();
  __formSchemasTestHooks.reset();
});

test("setCourseStatus blocks publish when active form is missing", async () => {
  __coursesTestHooks.setGetCourseOverride(async () =>
    draftCourse({
      activeFormId: null,
      activeFormVersion: null
    })
  );

  await assert.rejects(
    () => setCourseStatus("ten_001", "crs_001", "usr_001", "publish"),
    (error: unknown) => {
      const apiError = asApiError(error);
      assert.equal(apiError.statusCode, 409);
      assert.equal(apiError.code, "CONFLICT");
      assert.match(apiError.message, /active form schema/i);
      return true;
    }
  );
});

test("setCourseStatus blocks publish when active form has no required applicant identity field", async () => {
  __coursesTestHooks.setGetCourseOverride(async () => draftCourse());
  __formSchemasTestHooks.setGetCourseFormSchemaVersionOverride(async () => ({
    formId: "frm_001",
    version: 1,
    tenantId: "ten_001",
    courseId: "crs_001",
    status: "active",
    fields: [
      {
        fieldId: "notes",
        type: "long_text",
        label: "Notes",
        required: true,
        displayOrder: 1
      }
    ],
    createdAt: "2026-03-10T00:00:00Z",
    updatedAt: "2026-03-10T00:00:00Z"
  }));

  await assert.rejects(
    () => setCourseStatus("ten_001", "crs_001", "usr_001", "publish"),
    (error: unknown) => {
      const apiError = asApiError(error);
      assert.equal(apiError.statusCode, 409);
      assert.equal(apiError.code, "CONFLICT");
      assert.match(apiError.message, /identity field/i);
      return true;
    }
  );
});

test("setCourseStatus allows publish when active form has a required applicant identity field", async () => {
  __coursesTestHooks.setGetCourseOverride(async () => draftCourse());
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
  __coursesTestHooks.setDdbSendOverride(async (command) => {
    const commandName = (command as { constructor?: { name?: string } }).constructor?.name;
    if (commandName === "GetCommand") {
      return {
        Item: {
          tenantCode: "std-school"
        }
      };
    }
    if (commandName === "UpdateCommand") {
      return {
        Attributes: {
          ...draftCourse(),
          status: "published",
          publicVisible: true,
          updatedAt: "2026-03-25T00:00:00Z"
        }
      };
    }
    if (commandName === "PutCommand" || commandName === "DeleteCommand") {
      return {};
    }
    throw new Error(`Unexpected command: ${commandName}`);
  });

  const result = await setCourseStatus("ten_001", "crs_001", "usr_001", "publish");
  assert.equal(result.status, "published");
  assert.equal(result.publicVisible, true);
});
