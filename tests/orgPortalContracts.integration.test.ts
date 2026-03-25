import test from "node:test";
import assert from "node:assert/strict";
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import { handler as coursesListHandler } from "../services/api/src/handlers/orgCoursesList";
import { handler as formSchemaLatestHandler } from "../services/api/src/handlers/orgFormSchemaGetLatest";
import { handler as submissionsListHandler } from "../services/api/src/handlers/orgSubmissionsList";
import { __coursesTestHooks, type ListCoursesInput } from "../services/api/src/lib/courses";
import { __formSchemasTestHooks } from "../services/api/src/lib/formSchemas";
import { __submissionsTestHooks } from "../services/api/src/lib/submissions";

function asStructuredResult(
  result: Awaited<ReturnType<typeof coursesListHandler>>
): APIGatewayProxyStructuredResultV2 {
  if (!result || typeof result === "string") {
    throw new Error("Expected structured lambda response.");
  }
  return result;
}

function baseContext(path: string, method: string, requestId: string) {
  return {
    accountId: "123456789012",
    apiId: "api",
    domainName: "example.com",
    domainPrefix: "example",
    http: {
      method,
      path,
      protocol: "HTTP/1.1",
      sourceIp: "127.0.0.1",
      userAgent: "node-test"
    },
    requestId,
    routeKey: `${method} ${path}`,
    stage: "v1",
    time: "25/Mar/2026:00:00:00 +0000",
    timeEpoch: 0
  };
}

function makeEvent(
  path: string,
  method: string,
  requestId: string,
  options?: {
    queryStringParameters?: Record<string, string>;
    pathParameters?: Record<string, string>;
  }
): APIGatewayProxyEventV2 {
  return {
    version: "2.0",
    routeKey: `${method} ${path}`,
    rawPath: path,
    rawQueryString: "",
    queryStringParameters: options?.queryStringParameters,
    pathParameters: options?.pathParameters,
    headers: {
      "x-user-id": "usr_1",
      "x-tenant-id": "ten_1",
      "x-role": "org_admin"
    },
    requestContext: baseContext(path, method, requestId),
    isBase64Encoded: false
  } as APIGatewayProxyEventV2;
}

test("orgCoursesList forwards filters and returns workflow metadata", async () => {
  const oldMode = process.env.AUTH_MODE;
  process.env.AUTH_MODE = "mock";
  let receivedInput: ListCoursesInput | undefined;
  __coursesTestHooks.setListCoursesOverride(async (_tenantId, input) => {
    receivedInput = input;
    return [
      {
        id: "crs_1",
        tenantId: "ten_1",
        title: "Intro to AI",
        shortDescription: "Foundation course",
        fullDescription: "Long form description",
        startDate: "2026-04-01",
        endDate: "2026-04-30",
        enrollmentOpenAt: "2999-03-01T00:00:00Z",
        enrollmentCloseAt: "2999-03-31T23:59:59Z",
        deliveryMode: "online",
        locationText: null,
        capacity: 100,
        status: "draft",
        publicVisible: false,
        pricingMode: "free",
        paymentEnabledFlag: false,
        imageAssetId: null,
        activeFormId: "frm_1",
        activeFormVersion: 2,
        createdAt: "2026-03-01T00:00:00Z",
        updatedAt: "2026-03-20T00:00:00Z",
        createdBy: "usr_1",
        updatedBy: "usr_1"
      }
    ];
  });

  try {
    const result = asStructuredResult(
      await coursesListHandler(
        makeEvent("/org/courses", "GET", "req_courses_list", {
          queryStringParameters: {
            status: "draft",
            pricingMode: "free",
            deliveryMode: "online",
            publicVisible: "false",
            q: "intro"
          }
        }),
        {} as never,
        () => undefined
      )
    );
    assert.equal(result.statusCode, 200);
    assert.deepEqual(receivedInput, {
      status: "draft",
      pricingMode: "free",
      deliveryMode: "online",
      publicVisible: false,
      q: "intro"
    });
    const body = JSON.parse(result.body as string) as {
      data: Array<{ workflow: { enrollmentStatus: string; hasActiveForm: boolean; publishReady: boolean } }>;
    };
    assert.equal(body.data[0]?.workflow.enrollmentStatus, "upcoming");
    assert.equal(body.data[0]?.workflow.hasActiveForm, true);
    assert.equal(body.data[0]?.workflow.publishReady, true);
  } finally {
    __coursesTestHooks.reset();
    process.env.AUTH_MODE = oldMode;
  }
});

test("orgFormSchemaGetLatest returns a summary block for list-detail UIs", async () => {
  const oldMode = process.env.AUTH_MODE;
  process.env.AUTH_MODE = "mock";
  __formSchemasTestHooks.setGetLatestCourseFormSchemaOverride(async () => ({
    formId: "frm_1",
    version: 3,
    tenantId: "ten_1",
    courseId: "crs_1",
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
        fieldId: "email",
        type: "email",
        label: "Email",
        required: true,
        displayOrder: 2
      },
      {
        fieldId: "notes",
        type: "long_text",
        label: "Notes",
        required: false,
        displayOrder: 3
      }
    ],
    createdAt: "2026-03-01T00:00:00Z",
    updatedAt: "2026-03-20T00:00:00Z"
  }));

  try {
    const result = asStructuredResult(
      await formSchemaLatestHandler(
        makeEvent("/org/courses/crs_1/form-schema", "GET", "req_form_latest", {
          pathParameters: { courseId: "crs_1" }
        }),
        {} as never,
        () => undefined
      )
    );
    assert.equal(result.statusCode, 200);
    const body = JSON.parse(result.body as string) as {
      data: { summary: { fieldCount: number; requiredFieldCount: number; fieldTypes: string[] } };
    };
    assert.equal(body.data.summary.fieldCount, 3);
    assert.equal(body.data.summary.requiredFieldCount, 2);
    assert.deepEqual(body.data.summary.fieldTypes, ["email", "long_text", "short_text"]);
  } finally {
    __formSchemasTestHooks.reset();
    process.env.AUTH_MODE = oldMode;
  }
});

test("orgSubmissionsList adds course title and review workflow metadata", async () => {
  const oldMode = process.env.AUTH_MODE;
  process.env.AUTH_MODE = "mock";
  __submissionsTestHooks.setListOrgSubmissionsOverride(async () => ({
    data: [
      {
        id: "sub_1",
        tenantId: "ten_1",
        tenantCode: "tenant-a",
        courseId: "crs_1",
        formId: "frm_1",
        formVersion: 1,
        status: "submitted",
        applicant: { email: "learner@example.com" },
        answers: {},
        submittedAt: "2026-03-20T00:00:00Z",
        reviewedAt: null,
        reviewedBy: null,
        createdAt: "2026-03-20T00:00:00Z",
        applicantSummary: { email: "learner@example.com", name: "Learner" },
        course: { id: "crs_1" }
      }
    ],
    page: { limit: 20, nextCursor: null }
  }));
  __coursesTestHooks.setListCoursesOverride(async () => [
    {
      id: "crs_1",
      tenantId: "ten_1",
      title: "Intro to AI",
      shortDescription: "Foundation course",
      fullDescription: "Long form description",
      startDate: "2026-04-01",
      endDate: "2026-04-30",
      enrollmentOpenAt: "2026-03-01T00:00:00Z",
      enrollmentCloseAt: "2026-03-31T23:59:59Z",
      deliveryMode: "online",
      locationText: null,
      capacity: 100,
      status: "published",
      publicVisible: true,
      pricingMode: "free",
      paymentEnabledFlag: false,
      imageAssetId: null,
      activeFormId: "frm_1",
      activeFormVersion: 1,
      createdAt: "2026-03-01T00:00:00Z",
      updatedAt: "2026-03-20T00:00:00Z",
      createdBy: "usr_1",
      updatedBy: "usr_1"
    }
  ]);

  try {
    const result = asStructuredResult(
      await submissionsListHandler(
        makeEvent("/org/submissions", "GET", "req_submissions_list"),
        {} as never,
        () => undefined
      )
    );
    assert.equal(result.statusCode, 200);
    const body = JSON.parse(result.body as string) as {
      data: Array<{ workflow: { canReview: boolean; isTerminal: boolean }; course: { title: string | null } }>;
    };
    assert.equal(body.data[0]?.course.title, "Intro to AI");
    assert.equal(body.data[0]?.workflow.canReview, true);
    assert.equal(body.data[0]?.workflow.isTerminal, false);
  } finally {
    __submissionsTestHooks.reset();
    __coursesTestHooks.reset();
    process.env.AUTH_MODE = oldMode;
  }
});
