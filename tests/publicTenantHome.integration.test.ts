import test from "node:test";
import assert from "node:assert/strict";
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import { handler } from "../services/api/src/handlers/publicTenantHomeGet";

function asStructuredResult(
  result: Awaited<ReturnType<typeof handler>>
): APIGatewayProxyStructuredResultV2 {
  if (!result || typeof result === "string") {
    throw new Error("Expected structured lambda response.");
  }
  return result;
}

function makeEvent(pathParameters?: Record<string, string>): APIGatewayProxyEventV2 {
  return {
    version: "2.0",
    routeKey: "GET /public/{tenantCode}/tenant-home",
    rawPath: "/public/tenant-home",
    rawQueryString: "",
    headers: {},
    pathParameters,
    requestContext: {
      accountId: "123456789012",
      apiId: "api",
      domainName: "example.com",
      domainPrefix: "example",
      http: {
        method: "GET",
        path: "/public/tenant-home",
        protocol: "HTTP/1.1",
        sourceIp: "127.0.0.1",
        userAgent: "node-test"
      },
      requestId: "req_public_tenant_home",
      routeKey: "GET /public/{tenantCode}/tenant-home",
      stage: "v1",
      time: "20/Mar/2026:00:00:00 +0000",
      timeEpoch: 0
    },
    isBase64Encoded: false
  };
}

test("publicTenantHomeGet returns 400 when tenantCode path is missing", async () => {
  const result = asStructuredResult(await handler(makeEvent(), {} as never, () => undefined));
  assert.equal(result.statusCode, 400);
  const body = JSON.parse(result.body as string) as { error?: { code?: string } };
  assert.equal(body.error?.code, "VALIDATION_ERROR");
});
