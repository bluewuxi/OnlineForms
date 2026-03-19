import test from "node:test";
import assert from "node:assert/strict";
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import { handler } from "../services/api/src/handlers/publicTenantsList";

function asStructuredResult(
  result: Awaited<ReturnType<typeof handler>>
): APIGatewayProxyStructuredResultV2 {
  if (!result || typeof result === "string") {
    throw new Error("Expected structured lambda response.");
  }
  return result;
}

function makeEvent(limit?: string): APIGatewayProxyEventV2 {
  return {
    version: "2.0",
    routeKey: "GET /public/tenants",
    rawPath: "/public/tenants",
    rawQueryString: limit ? `limit=${limit}` : "",
    headers: {},
    queryStringParameters: limit ? { limit } : undefined,
    requestContext: {
      accountId: "123456789012",
      apiId: "api",
      domainName: "example.com",
      domainPrefix: "example",
      http: {
        method: "GET",
        path: "/public/tenants",
        protocol: "HTTP/1.1",
        sourceIp: "127.0.0.1",
        userAgent: "node-test"
      },
      requestId: "req_public_tenants",
      routeKey: "GET /public/tenants",
      stage: "v1",
      time: "20/Mar/2026:00:00:00 +0000",
      timeEpoch: 0
    },
    isBase64Encoded: false
  };
}

test("publicTenantsList returns 400 for invalid limit", async () => {
  const result = asStructuredResult(await handler(makeEvent("abc"), {} as never, () => undefined));
  assert.equal(result.statusCode, 400);
  const body = JSON.parse(result.body as string) as { error?: { code?: string } };
  assert.equal(body.error?.code, "VALIDATION_ERROR");
});
