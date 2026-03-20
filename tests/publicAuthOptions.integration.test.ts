import test from "node:test";
import assert from "node:assert/strict";
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import { handler } from "../services/api/src/handlers/publicAuthOptionsGet";

function asStructuredResult(
  result: Awaited<ReturnType<typeof handler>>
): APIGatewayProxyStructuredResultV2 {
  if (!result || typeof result === "string") {
    throw new Error("Expected structured lambda response.");
  }
  return result;
}

function makeEvent(): APIGatewayProxyEventV2 {
  return {
    version: "2.0",
    routeKey: "GET /public/auth-options",
    rawPath: "/public/auth-options",
    rawQueryString: "",
    headers: {},
    requestContext: {
      accountId: "123456789012",
      apiId: "api",
      domainName: "example.com",
      domainPrefix: "example",
      http: {
        method: "GET",
        path: "/public/auth-options",
        protocol: "HTTP/1.1",
        sourceIp: "127.0.0.1",
        userAgent: "node-test"
      },
      requestId: "req_public_auth_options",
      routeKey: "GET /public/auth-options",
      stage: "v1",
      time: "20/Mar/2026:00:00:00 +0000",
      timeEpoch: 0
    },
    isBase64Encoded: false
  };
}

test("publicAuthOptionsGet returns role directory including internal_admin", async () => {
  const result = asStructuredResult(await handler(makeEvent(), {} as never, () => undefined));
  assert.equal(result.statusCode, 200);
  const body = JSON.parse(result.body as string) as {
    data: { roles: Array<{ role: string; requiresTenant: boolean }> };
  };
  const internalAdmin = body.data.roles.find((row) => row.role === "internal_admin");
  assert.ok(internalAdmin);
  assert.equal(internalAdmin.requiresTenant, false);
});
