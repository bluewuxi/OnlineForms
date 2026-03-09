import test from "node:test";
import assert from "node:assert/strict";
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import { handler } from "../services/api/src/handlers/orgAuditList";

function asStructuredResult(
  result: Awaited<ReturnType<typeof handler>>
): APIGatewayProxyStructuredResultV2 {
  if (!result || typeof result === "string") throw new Error("Expected structured lambda response.");
  return result;
}

test("orgAuditList returns 400 for invalid limit", async () => {
  const oldMode = process.env.AUTH_MODE;
  process.env.AUTH_MODE = "mock";
  try {
    const event = {
      version: "2.0",
      routeKey: "GET /org/audit",
      rawPath: "/org/audit",
      rawQueryString: "limit=abc",
      queryStringParameters: { limit: "abc" },
      headers: {
        "x-user-id": "usr_1",
        "x-tenant-id": "ten_1",
        "x-role": "org_admin"
      },
      requestContext: {
        accountId: "123456789012",
        apiId: "api",
        domainName: "example.com",
        domainPrefix: "example",
        http: {
          method: "GET",
          path: "/org/audit",
          protocol: "HTTP/1.1",
          sourceIp: "127.0.0.1",
          userAgent: "node-test"
        },
        requestId: "req_audit_list",
        routeKey: "GET /org/audit",
        stage: "v1",
        time: "10/Mar/2026:00:00:00 +0000",
        timeEpoch: 0
      },
      isBase64Encoded: false
    } as APIGatewayProxyEventV2;

    const result = asStructuredResult(await handler(event, {} as never, () => undefined));
    assert.equal(result.statusCode, 400);
  } finally {
    process.env.AUTH_MODE = oldMode;
  }
});
