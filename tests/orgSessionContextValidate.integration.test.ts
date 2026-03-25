import test from "node:test";
import assert from "node:assert/strict";
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import { handler } from "../services/api/src/handlers/orgSessionContextValidate";
import { __authContextsTestHooks } from "../services/api/src/lib/authContexts";

function asStructuredResult(
  result: Awaited<ReturnType<typeof handler>>
): APIGatewayProxyStructuredResultV2 {
  if (!result || typeof result === "string") {
    throw new Error("Expected structured lambda response.");
  }
  return result;
}

function makeEvent(body: unknown, headers?: Record<string, string>): APIGatewayProxyEventV2 {
  return {
    version: "2.0",
    routeKey: "POST /org/session-context",
    rawPath: "/org/session-context",
    rawQueryString: "",
    headers: {
      "x-user-id": "usr_1",
      "x-role": "org_admin",
      "x-tenant-id": "ten_1",
      ...(headers ?? {})
    },
    body: JSON.stringify(body),
    requestContext: {
      accountId: "123456789012",
      apiId: "api",
      domainName: "example.com",
      domainPrefix: "example",
      http: {
        method: "POST",
        path: "/org/session-context",
        protocol: "HTTP/1.1",
        sourceIp: "127.0.0.1",
        userAgent: "node-test"
      },
      requestId: "req_org_session_context_validate",
      routeKey: "POST /org/session-context",
      stage: "v1",
      time: "24/Mar/2026:00:00:00 +0000",
      timeEpoch: 0
    },
    isBase64Encoded: false
  };
}

test("orgSessionContextValidate allows internal_admin without tenantId", async () => {
  const oldMode = process.env.AUTH_MODE;
  process.env.AUTH_MODE = "mock";
  try {
    const result = asStructuredResult(
      await handler(
        makeEvent(
          { role: "internal_admin" },
          {
            "x-role": "internal_admin",
            "x-tenant-id": ""
          }
        ),
        {} as never,
        () => undefined
      )
    );
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
    assert.equal(body.data.role, "internal_admin");
    assert.equal(body.data.tenantId, null);
    assert.deepEqual(body.data.shell, { portal: "internal", tenantScoped: false });
  } finally {
    process.env.AUTH_MODE = oldMode;
  }
});

test("orgSessionContextValidate rejects org role without tenantId", async () => {
  const oldMode = process.env.AUTH_MODE;
  process.env.AUTH_MODE = "mock";
  try {
    const result = asStructuredResult(
      await handler(
        makeEvent(
          { role: "org_admin" },
          {
            "x-tenant-id": ""
          }
        ),
        {} as never,
        () => undefined
      )
    );
    assert.equal(result.statusCode, 400);
    const body = JSON.parse(result.body as string) as {
      error: { details?: Array<{ field?: string; issue: string }> };
    };
    assert.equal(body.error.details?.[0]?.issue, "tenant_required");
  } finally {
    process.env.AUTH_MODE = oldMode;
  }
});

test("orgSessionContextValidate validates tenant membership when tenantId is provided", async () => {
  const oldMode = process.env.AUTH_MODE;
  process.env.AUTH_MODE = "mock";
  __authContextsTestHooks.setContextLoaderOverride(async () => [
    { tenantId: "ten_1", status: "active", roles: ["org_admin"] }
  ]);

  try {
    const result = asStructuredResult(
      await handler(
        makeEvent({
          tenantId: "ten_1",
          role: "org_admin"
        }),
        {} as never,
        () => undefined
      )
    );
    assert.equal(result.statusCode, 200);
    const body = JSON.parse(result.body as string) as {
      data: { shell: { portal: string; tenantScoped: boolean } };
    };
    assert.deepEqual(body.data.shell, { portal: "org", tenantScoped: true });
  } finally {
    __authContextsTestHooks.reset();
    process.env.AUTH_MODE = oldMode;
  }
});

test("orgSessionContextValidate allows internal_admin with tenantId without membership lookup", async () => {
  const oldMode = process.env.AUTH_MODE;
  process.env.AUTH_MODE = "mock";
  __authContextsTestHooks.setContextLoaderOverride(async () => []);

  try {
    const result = asStructuredResult(
      await handler(
        makeEvent(
          {
            tenantId: "ten_1",
            role: "internal_admin"
          },
          {
            "x-role": "internal_admin",
            "x-tenant-id": "ten_1"
          }
        ),
        {} as never,
        () => undefined
      )
    );
    assert.equal(result.statusCode, 200);
    const body = JSON.parse(result.body as string) as {
      data: { tenantId: string | null; role: string; shell: { portal: string; tenantScoped: boolean } };
    };
    assert.equal(body.data.tenantId, "ten_1");
    assert.equal(body.data.role, "internal_admin");
    assert.deepEqual(body.data.shell, { portal: "org", tenantScoped: true });
  } finally {
    __authContextsTestHooks.reset();
    process.env.AUTH_MODE = oldMode;
  }
});

test("orgSessionContextValidate returns invalid_context detail for unauthorized tenant-role selection", async () => {
  const oldMode = process.env.AUTH_MODE;
  process.env.AUTH_MODE = "mock";
  __authContextsTestHooks.setContextLoaderOverride(async () => [
    { tenantId: "ten_1", status: "active", roles: ["org_editor"] }
  ]);

  try {
    const result = asStructuredResult(
      await handler(
        makeEvent({
          tenantId: "ten_1",
          role: "org_admin"
        }),
        {} as never,
        () => undefined
      )
    );
    assert.equal(result.statusCode, 403);
    const body = JSON.parse(result.body as string) as {
      error: { details?: Array<{ field?: string; issue: string }> };
    };
    assert.equal(body.error.details?.[0]?.issue, "invalid_context");
  } finally {
    __authContextsTestHooks.reset();
    process.env.AUTH_MODE = oldMode;
  }
});
