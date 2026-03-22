import test from "node:test";
import assert from "node:assert/strict";
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import { handler } from "../services/api/src/handlers/orgSessionContextsGet";
import { __authContextsTestHooks } from "../services/api/src/lib/authContexts";

function asStructuredResult(
  result: Awaited<ReturnType<typeof handler>>
): APIGatewayProxyStructuredResultV2 {
  if (!result || typeof result === "string") {
    throw new Error("Expected structured lambda response.");
  }
  return result;
}

function makeEvent(queryStringParameters?: Record<string, string>): APIGatewayProxyEventV2 {
  return {
    version: "2.0",
    routeKey: "GET /org/session-contexts",
    rawPath: "/org/session-contexts",
    rawQueryString: "",
    headers: {
      "x-user-id": "usr_1",
      "x-role": "org_admin",
      "x-tenant-id": "ten_1"
    },
    queryStringParameters,
    requestContext: {
      accountId: "123456789012",
      apiId: "api",
      domainName: "example.com",
      domainPrefix: "example",
      http: {
        method: "GET",
        path: "/org/session-contexts",
        protocol: "HTTP/1.1",
        sourceIp: "127.0.0.1",
        userAgent: "node-test"
      },
      requestId: "req_org_session_contexts",
      routeKey: "GET /org/session-contexts",
      stage: "v1",
      time: "23/Mar/2026:00:00:00 +0000",
      timeEpoch: 0
    },
    isBase64Encoded: false
  };
}

test("orgSessionContextsGet filters contexts by status", async () => {
  const oldMode = process.env.AUTH_MODE;
  process.env.AUTH_MODE = "mock";
  __authContextsTestHooks.setContextLoaderOverride(async () => [
    { tenantId: "ten_1", status: "active", roles: ["org_admin"] },
    { tenantId: "ten_2", status: "invited", roles: ["org_editor"] }
  ]);

  try {
    const result = asStructuredResult(
      await handler(makeEvent({ status: "active" }), {} as never, () => undefined)
    );
    assert.equal(result.statusCode, 200);
    const body = JSON.parse(result.body as string) as {
      data: { contexts: Array<{ tenantId: string; status: string }> };
    };
    assert.equal(body.data.contexts.length, 1);
    assert.equal(body.data.contexts[0].tenantId, "ten_1");
  } finally {
    __authContextsTestHooks.reset();
    process.env.AUTH_MODE = oldMode;
  }
});

test("orgSessionContextsGet returns 400 on invalid status filter", async () => {
  const oldMode = process.env.AUTH_MODE;
  process.env.AUTH_MODE = "mock";
  __authContextsTestHooks.setContextLoaderOverride(async () => []);

  try {
    const result = asStructuredResult(
      await handler(makeEvent({ status: "active,blocked" }), {} as never, () => undefined)
    );
    assert.equal(result.statusCode, 400);
  } finally {
    __authContextsTestHooks.reset();
    process.env.AUTH_MODE = oldMode;
  }
});
