import test from "node:test";
import assert from "node:assert/strict";
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import { handler } from "../services/api/src/handlers/orgMe";

function makeEvent(headers: Record<string, string>): APIGatewayProxyEventV2 {
  return {
    version: "2.0",
    routeKey: "GET /org/me",
    rawPath: "/org/me",
    rawQueryString: "",
    headers,
    requestContext: {
      accountId: "123456789012",
      apiId: "api",
      domainName: "example.com",
      domainPrefix: "example",
      http: {
        method: "GET",
        path: "/org/me",
        protocol: "HTTP/1.1",
        sourceIp: "127.0.0.1",
        userAgent: "node-test"
      },
      requestId: "req_123",
      routeKey: "GET /org/me",
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

test("orgMe returns auth context in mock mode", async () => {
  const oldMode = process.env.AUTH_MODE;
  process.env.AUTH_MODE = "mock";
  try {
    const event = makeEvent({
      "x-user-id": "usr_1",
      "x-tenant-id": "ten_1",
      "x-role": "org_admin"
    });

    const result = asStructuredResult(await handler(event, {} as never, () => undefined));
    assert.equal(result.statusCode, 200);
    assert.ok(result.body);

    const body = JSON.parse(result.body as string) as {
      data: {
        userId: string;
        tenantId: string | null;
        role: string;
        shell: { portal: string; tenantScoped: boolean };
      };
    };
    assert.equal(body.data.userId, "usr_1");
    assert.equal(body.data.tenantId, "ten_1");
    assert.equal(body.data.role, "org_admin");
    assert.deepEqual(body.data.shell, { portal: "org", tenantScoped: true });
  } finally {
    process.env.AUTH_MODE = oldMode;
  }
});

test("orgMe allows internal_admin bootstrap without tenant context", async () => {
  const oldMode = process.env.AUTH_MODE;
  process.env.AUTH_MODE = "mock";
  try {
    const event = makeEvent({
      "x-user-id": "usr_1",
      "x-role": "internal_admin",
      "x-tenant-id": ""
    });

    const result = asStructuredResult(await handler(event, {} as never, () => undefined));
    assert.equal(result.statusCode, 200);
    const body = JSON.parse(result.body as string) as {
      data: {
        userId: string;
        tenantId: string | null;
        role: string;
        shell: { portal: string; tenantScoped: boolean };
      };
    };
    assert.equal(body.data.userId, "usr_1");
    assert.equal(body.data.tenantId, null);
    assert.equal(body.data.role, "internal_admin");
    assert.deepEqual(body.data.shell, { portal: "internal", tenantScoped: false });
  } finally {
    process.env.AUTH_MODE = oldMode;
  }
});
