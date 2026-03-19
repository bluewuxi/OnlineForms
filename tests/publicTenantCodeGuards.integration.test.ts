import test from "node:test";
import assert from "node:assert/strict";
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import { handler as publicCoursesListHandler } from "../services/api/src/handlers/publicCoursesList";

function asStructuredResult(
  result: Awaited<ReturnType<typeof publicCoursesListHandler>>
): APIGatewayProxyStructuredResultV2 {
  if (!result || typeof result === "string") {
    throw new Error("Expected structured lambda response.");
  }
  return result;
}

function makeEvent(tenantCode: string): APIGatewayProxyEventV2 {
  return {
    version: "2.0",
    routeKey: "GET /public/{tenantCode}/courses",
    rawPath: `/public/${tenantCode}/courses`,
    rawQueryString: "",
    headers: {},
    pathParameters: {
      tenantCode
    },
    queryStringParameters: undefined,
    requestContext: {
      accountId: "123456789012",
      apiId: "api",
      domainName: "example.com",
      domainPrefix: "example",
      http: {
        method: "GET",
        path: `/public/${tenantCode}/courses`,
        protocol: "HTTP/1.1",
        sourceIp: "127.0.0.1",
        userAgent: "node-test"
      },
      requestId: "req_public_guard",
      routeKey: "GET /public/{tenantCode}/courses",
      stage: "v1",
      time: "20/Mar/2026:00:00:00 +0000",
      timeEpoch: 0
    },
    isBase64Encoded: false
  };
}

test("publicCoursesList returns 400 for reserved tenant code", async () => {
  const result = asStructuredResult(await publicCoursesListHandler(makeEvent("org"), {} as never, () => undefined));
  assert.equal(result.statusCode, 400);
  assert.ok(result.body);
  const body = JSON.parse(result.body as string) as {
    error?: { code?: string; details?: Array<{ field?: string; issue?: string }> };
  };
  assert.equal(body.error?.code, "VALIDATION_ERROR");
  assert.equal(body.error?.details?.[0]?.field, "tenantCode");
});
