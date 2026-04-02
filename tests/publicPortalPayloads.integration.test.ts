import test from "node:test";
import assert from "node:assert/strict";
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import { handler as publicTenantsHandler } from "../services/api/src/handlers/publicTenantsList";
import { handler as publicTenantHomeHandler } from "../services/api/src/handlers/publicTenantHomeGet";
import { handler as publicCoursesListHandler } from "../services/api/src/handlers/publicCoursesList";
import { handler as publicCourseDetailHandler } from "../services/api/src/handlers/publicCoursesGet";
import { handler as publicEnrollmentsCreateHandler } from "../services/api/src/handlers/publicEnrollmentsCreate";
import { __assetsTestHooks } from "../services/api/src/lib/assets";
import { __tenantsTestHooks } from "../services/api/src/lib/tenants";
import { __coursesTestHooks } from "../services/api/src/lib/courses";
import { __submissionsTestHooks } from "../services/api/src/lib/submissions";

function asStructuredResult(
  result: Awaited<ReturnType<typeof publicTenantsHandler>>
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

test.afterEach(() => {
  __assetsTestHooks.reset();
  __tenantsTestHooks.reset();
  __coursesTestHooks.reset();
  __submissionsTestHooks.reset();
});

test("public tenant directory includes branding and public links", async () => {
  __tenantsTestHooks.setPublicTenantDirectoryOverride(async () => [
    {
      tenantId: "ten_001",
      tenantCode: "std-school",
      displayName: "Std School",
      description: "Short courses for community learners.",
      isActive: true,
      branding: {
        logoAssetId: "ast_logo",
        logoUrl: "https://cdn.onlineforms.com/assets/ast_logo"
      },
      links: {
        home: "/v1/public/std-school/tenant-home",
        courses: "/v1/public/std-school/courses"
      }
    }
  ]);

  const event = {
    version: "2.0",
    routeKey: "GET /public/tenants",
    rawPath: "/public/tenants",
    rawQueryString: "",
    headers: {},
    requestContext: baseContext("/public/tenants", "GET", "req_public_tenants_payload"),
    isBase64Encoded: false
  } as APIGatewayProxyEventV2;

  const result = asStructuredResult(await publicTenantsHandler(event, {} as never, () => undefined));
  assert.equal(result.statusCode, 200);
  const body = JSON.parse(result.body as string) as {
    data: Array<{ branding: { logoUrl: string | null }; links: { home: string; courses: string } }>;
  };
  assert.equal(body.data[0]?.branding.logoUrl, "https://cdn.onlineforms.com/assets/ast_logo");
  assert.equal(body.data[0]?.links.home, "/v1/public/std-school/tenant-home");
  assert.equal(body.data[0]?.links.courses, "/v1/public/std-school/courses");
});

test("public tenant home includes branding logoUrl and self link", async () => {
  __tenantsTestHooks.setPublicTenantHomeOverride(async () => ({
    tenantCode: "std-school",
    displayName: "Std School",
    description: "Welcome",
    homePageContent: "Intro content",
    isActive: true,
    branding: {
      logoAssetId: "ast_logo",
      logoUrl: "https://cdn.onlineforms.com/assets/ast_logo"
    },
    links: {
      home: "/v1/public/std-school/tenant-home",
      publishedCourses: "/v1/public/std-school/courses"
    }
  }));

  const event = {
    version: "2.0",
    routeKey: "GET /public/{tenantCode}/tenant-home",
    rawPath: "/public/std-school/tenant-home",
    rawQueryString: "",
    headers: {},
    pathParameters: { tenantCode: "std-school" },
    requestContext: baseContext("/public/std-school/tenant-home", "GET", "req_public_tenant_home_payload"),
    isBase64Encoded: false
  } as APIGatewayProxyEventV2;

  const result = asStructuredResult(await publicTenantHomeHandler(event, {} as never, () => undefined));
  assert.equal(result.statusCode, 200);
  const body = JSON.parse(result.body as string) as {
    data: { branding: { logoUrl: string | null }; links: { home: string; publishedCourses: string } };
  };
  assert.equal(body.data.branding.logoUrl, "https://cdn.onlineforms.com/assets/ast_logo");
  assert.equal(body.data.links.home, "/v1/public/std-school/tenant-home");
  assert.equal(body.data.links.publishedCourses, "/v1/public/std-school/courses");
});

test("public course list includes enrollment metadata and links", async () => {
  __coursesTestHooks.setPublicCoursesListOverride(async () => ({
    data: [
      {
        id: "crs_001",
        title: "Intro to AI",
        shortDescription: "Foundations course",
        imageUrl: "https://cdn.onlineforms.com/assets/course_1",
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
        }
      }
    ],
    page: {
      limit: 20,
      nextCursor: null
    }
  }));

  const event = {
    version: "2.0",
    routeKey: "GET /public/{tenantCode}/courses",
    rawPath: "/public/std-school/courses",
    rawQueryString: "",
    headers: {},
    pathParameters: { tenantCode: "std-school" },
    requestContext: baseContext("/public/std-school/courses", "GET", "req_public_courses_payload"),
    isBase64Encoded: false
  } as APIGatewayProxyEventV2;

  const result = asStructuredResult(await publicCoursesListHandler(event, {} as never, () => undefined));
  assert.equal(result.statusCode, 200);
  const body = JSON.parse(result.body as string) as {
    data: Array<{
      enrollmentStatus: string;
      enrollmentOpenNow: boolean;
      links: { detail: string; enrollmentForm: string };
    }>;
  };
  assert.equal(body.data[0]?.enrollmentStatus, "open");
  assert.equal(body.data[0]?.enrollmentOpenNow, true);
  assert.equal(body.data[0]?.links.detail, "/v1/public/std-school/courses/crs_001");
  assert.equal(body.data[0]?.links.enrollmentForm, "/v1/public/std-school/courses/crs_001/form");
});

test("public course detail includes form availability and capacity", async () => {
  __coursesTestHooks.setPublicCourseDetailOverride(async () => ({
    id: "crs_001",
    title: "Intro to AI",
    shortDescription: "Foundations course",
    imageUrl: "https://cdn.onlineforms.com/assets/course_1",
    startDate: "2026-04-01",
    endDate: "2026-04-28",
    deliveryMode: "online",
    pricingMode: "free",
    locationText: "Central campus",
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
    formAvailable: true
  }));

  const event = {
    version: "2.0",
    routeKey: "GET /public/{tenantCode}/courses/{courseId}",
    rawPath: "/public/std-school/courses/crs_001",
    rawQueryString: "",
    headers: {},
    pathParameters: { tenantCode: "std-school", courseId: "crs_001" },
    requestContext: baseContext("/public/std-school/courses/crs_001", "GET", "req_public_course_detail_payload"),
    isBase64Encoded: false
  } as APIGatewayProxyEventV2;

  const result = asStructuredResult(await publicCourseDetailHandler(event, {} as never, () => undefined));
  assert.equal(result.statusCode, 200);
  const body = JSON.parse(result.body as string) as {
    data: { formAvailable: boolean; capacity: number | null; locationText: string | null };
  };
  assert.equal(body.data.formAvailable, true);
  assert.equal(body.data.capacity, 120);
  assert.equal(body.data.locationText, "Central campus");
});

test("public course list resolves signed image URLs from projection imageAssetId", async () => {
  __coursesTestHooks.setResolveTenantIdByCodeOverride(async () => "ten_001");
  __coursesTestHooks.setDdbSendOverride(async (command) => {
    if ("input" in (command as { input?: object }) && (command as { input?: { IndexName?: string } }).input?.IndexName === "GSI2") {
      return {
        Items: [
          {
            projectionVersion: 1,
            entityType: "COURSE_PUBLIC",
            status: "published",
            publicVisible: true,
            tenantId: "ten_001",
            tenantCode: "std-school",
            courseId: "crs_001",
            title: "Intro to AI",
            shortDescription: "Foundations course",
            fullDescription: "Detailed syllabus",
            imageAssetId: "ast_course_1",
            imageUrl: "asset://ast_course_1",
            startDate: "2026-04-01",
            endDate: "2026-04-28",
            enrollmentOpenAt: "2026-03-10T00:00:00Z",
            enrollmentCloseAt: "2026-03-31T23:59:59Z",
            deliveryMode: "online",
            pricingMode: "free",
            locationText: null
          }
        ],
        LastEvaluatedKey: undefined
      };
    }
    throw new Error("Unexpected DDB command.");
  });
  __assetsTestHooks.setResolveAssetPublicUrlOverride(async (_tenantId, assetId) =>
    assetId ? `https://signed.example.com/${assetId}` : null
  );

  const event = {
    version: "2.0",
    routeKey: "GET /public/{tenantCode}/courses",
    rawPath: "/public/std-school/courses",
    rawQueryString: "",
    headers: {},
    pathParameters: { tenantCode: "std-school" },
    requestContext: baseContext("/public/std-school/courses", "GET", "req_public_courses_signed_image"),
    isBase64Encoded: false
  } as APIGatewayProxyEventV2;

  const result = asStructuredResult(await publicCoursesListHandler(event, {} as never, () => undefined));
  assert.equal(result.statusCode, 200);
  const body = JSON.parse(result.body as string) as {
    data: Array<{ imageUrl: string | null }>;
  };
  assert.equal(body.data[0]?.imageUrl, "https://signed.example.com/ast_course_1");
});

test("public course detail resolves signed image URLs from legacy stored imageUrl", async () => {
  __coursesTestHooks.setResolveTenantIdByCodeOverride(async () => "ten_001");
  __coursesTestHooks.setDdbSendOverride(async (command) => {
    if ("input" in (command as { input?: object }) && (command as { input?: { Key?: { SK?: string } } }).input?.Key?.SK === "COURSE_PUBLIC#crs_legacy") {
      return {
        Item: {
          projectionVersion: 1,
          entityType: "COURSE_PUBLIC",
          status: "published",
          publicVisible: true,
          tenantId: "ten_001",
          tenantCode: "std-school",
          courseId: "crs_legacy",
          title: "Legacy Course",
          shortDescription: "Legacy projection",
          fullDescription: "Detailed syllabus",
          imageUrl:
            "https://onlineforms-onlineformsassetsbucket-0ezpk4jxnvxa.s3.ap-southeast-2.amazonaws.com/tenants/ten_001/assets/ast_legacy001-cover.svg",
          startDate: "2026-04-01",
          endDate: "2026-04-28",
          enrollmentOpenAt: "2026-03-10T00:00:00Z",
          enrollmentCloseAt: "2026-03-31T23:59:59Z",
          deliveryMode: "online",
          pricingMode: "free",
          locationText: null,
          activeFormId: "frm_1",
          activeFormVersion: 1
        }
      };
    }
    throw new Error("Unexpected DDB command.");
  });
  __assetsTestHooks.setResolveAssetPublicUrlOverride(async (_tenantId, assetId) =>
    assetId ? `https://signed.example.com/${assetId}` : null
  );

  const event = {
    version: "2.0",
    routeKey: "GET /public/{tenantCode}/courses/{courseId}",
    rawPath: "/public/std-school/courses/crs_legacy",
    rawQueryString: "",
    headers: {},
    pathParameters: { tenantCode: "std-school", courseId: "crs_legacy" },
    requestContext: baseContext("/public/std-school/courses/crs_legacy", "GET", "req_public_course_detail_signed_image"),
    isBase64Encoded: false
  } as APIGatewayProxyEventV2;

  const result = asStructuredResult(await publicCourseDetailHandler(event, {} as never, () => undefined));
  assert.equal(result.statusCode, 200);
  const body = JSON.parse(result.body as string) as {
    data: { imageUrl: string | null; formAvailable: boolean };
  };
  assert.equal(body.data.imageUrl, "https://signed.example.com/ast_legacy001");
  assert.equal(body.data.formAvailable, true);
});

test("public enrollment success includes course context and links", async () => {
  __submissionsTestHooks.setCreatePublicEnrollmentOverride(async () => ({
    submissionId: "sub_001",
    status: "submitted",
    submittedAt: "2026-03-25T00:00:00.000Z",
    tenantCode: "std-school",
    courseId: "crs_001",
    courseTitle: "Intro to AI",
    links: {
      tenantHome: "/v1/public/std-school/tenant-home",
      course: "/v1/public/std-school/courses/crs_001"
    }
  }));

  const event = {
    version: "2.0",
    routeKey: "POST /public/{tenantCode}/courses/{courseId}/enrollments",
    rawPath: "/public/std-school/courses/crs_001/enrollments",
    rawQueryString: "",
    headers: {
      "content-type": "application/json",
      "Idempotency-Key": "3c579f90-4962-4a49-9ced-e6a37f63500a"
    },
    pathParameters: { tenantCode: "std-school", courseId: "crs_001" },
    body: JSON.stringify({
      formVersion: 1,
      answers: { first_name: "Alice" }
    }),
    requestContext: baseContext(
      "/public/std-school/courses/crs_001/enrollments",
      "POST",
      "req_public_enrollment_payload"
    ),
    isBase64Encoded: false
  } as APIGatewayProxyEventV2;

  const result = asStructuredResult(await publicEnrollmentsCreateHandler(event, {} as never, () => undefined));
  assert.equal(result.statusCode, 201);
  const body = JSON.parse(result.body as string) as {
    data: { courseTitle: string; links: { tenantHome: string; course: string } };
  };
  assert.equal(body.data.courseTitle, "Intro to AI");
  assert.equal(body.data.links.tenantHome, "/v1/public/std-school/tenant-home");
  assert.equal(body.data.links.course, "/v1/public/std-school/courses/crs_001");
});
