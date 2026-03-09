import test from "node:test";
import assert from "node:assert/strict";
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import { handler } from "../services/api/src/handlers/orgTenantCheck";

function makeEvent(
  tenantId: string | undefined,
  headers: Record<string, string>
): APIGatewayProxyEventV2 {
  return {
    version: "2.0",
    routeKey: "GET /org/tenants/{tenantId}/check",
    rawPath: tenantId ? `/org/tenants/${tenantId}/check` : "/org/tenants//check",
    rawQueryString: "",
    headers,
    pathParameters: tenantId ? { tenantId } : undefined,
    requestContext: {
      accountId: "123456789012",
      apiId: "api",
      domainName: "example.com",
      domainPrefix: "example",
      http: {
        method: "GET",
        path: "/org/tenants/{tenantId}/check",
        protocol: "HTTP/1.1",
        sourceIp: "127.0.0.1",
        userAgent: "node-test"
      },
      requestId: "req_456",
      routeKey: "GET /org/tenants/{tenantId}/check",
      stage: "v1",
      time: "10/Mar/2026:00:00:00 +0000",
      timeEpoch: 0
    },
    isBase64Encoded: false
  };
}

function asStructuredResult(
  result: Awaited<ReturnType<typeof handler>>
): APIGatewayProxyStructuredResultV2 {
  if (!result || typeof result === "string") {
    throw new Error("Expected structured lambda response.");
  }
  assert.ok("statusCode" in result);
  return result;
}

test("orgTenantCheck allows same-tenant access", async () => {
  const oldMode = process.env.AUTH_MODE;
  process.env.AUTH_MODE = "mock";
  try {
    const result = asStructuredResult(
      await handler(
        makeEvent("ten_1", {
          "x-user-id": "usr_1",
          "x-tenant-id": "ten_1",
          "x-role": "org_editor"
        }),
        {} as never,
        () => undefined
      )
    );
    assert.equal(result.statusCode, 200);
  } finally {
    process.env.AUTH_MODE = oldMode;
  }
});

test("orgTenantCheck denies cross-tenant access for org role", async () => {
  const oldMode = process.env.AUTH_MODE;
  process.env.AUTH_MODE = "mock";
  try {
    const result = asStructuredResult(
      await handler(
        makeEvent("ten_other", {
          "x-user-id": "usr_1",
          "x-tenant-id": "ten_1",
          "x-role": "org_admin"
        }),
        {} as never,
        () => undefined
      )
    );
    assert.equal(result.statusCode, 403);
    const body = JSON.parse(result.body as string) as { error: { code: string } };
    assert.equal(body.error.code, "FORBIDDEN");
  } finally {
    process.env.AUTH_MODE = oldMode;
  }
});

test("orgTenantCheck returns 400 when tenantId path parameter is missing", async () => {
  const oldMode = process.env.AUTH_MODE;
  process.env.AUTH_MODE = "mock";
  try {
    const result = asStructuredResult(
      await handler(
        makeEvent(undefined, {
          "x-user-id": "usr_1",
          "x-tenant-id": "ten_1",
          "x-role": "org_admin"
        }),
        {} as never,
        () => undefined
      )
    );
    assert.equal(result.statusCode, 400);
    const body = JSON.parse(result.body as string) as { error: { code: string } };
    assert.equal(body.error.code, "VALIDATION_ERROR");
  } finally {
    process.env.AUTH_MODE = oldMode;
  }
});
