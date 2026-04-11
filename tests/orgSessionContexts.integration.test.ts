import test from "node:test";
import assert from "node:assert/strict";
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import { handler } from "../services/api/src/handlers/orgSessionContextsGet";
import { __authContextsTestHooks } from "../services/api/src/lib/authContexts";
import { __authTestHooks } from "../services/api/src/lib/auth";

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
      data: {
        contexts: Array<{ tenantId: string; status: string }>;
        availablePortals: string[];
        selectionRequired: boolean;
        suggestedContext: { tenantId: string | null; role: string; portal: string } | null;
      };
    };
    assert.equal(body.data.contexts.length, 1);
    assert.equal(body.data.contexts[0].tenantId, "ten_1");
    assert.deepEqual(body.data.availablePortals, ["org"]);
    assert.equal(body.data.selectionRequired, false);
    assert.deepEqual(body.data.suggestedContext, {
      tenantId: "ten_1",
      role: "org_admin",
      portal: "org"
    });
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

test("orgSessionContextsGet returns empty contexts for user with no role in JWT", async () => {
  const restore = (() => {
    const old = process.env.AUTH_MODE;
    process.env.AUTH_MODE = "cognito";
    process.env.APP_ENV = "test";
    process.env.COGNITO_USER_POOL_ID = "ap-southeast-2_test";
    process.env.COGNITO_CLIENT_ID = "test-client-id";
    process.env.COGNITO_TOKEN_USE = "access";
    return () => {
      process.env.AUTH_MODE = old;
    };
  })();

  // Simulate a Cognito JWT with no role claims (new user, no org membership yet)
  __authTestHooks.setVerifierOverride({
    verify: async () => ({
      sub: "89ae2438-a021-70fc-0d6c-a8a4b667563b"
      // no custom:role, no custom:platformRole, no cognito:groups
    })
  });
  __authContextsTestHooks.setContextLoaderOverride(async () => []);

  try {
    const event = makeEvent();
    event.headers = { authorization: "Bearer fake-token" };
    const result = asStructuredResult(await handler(event, {} as never, () => undefined));
    assert.equal(result.statusCode, 200);
    const body = JSON.parse(result.body as string) as {
      data: { contexts: unknown[]; availablePortals: string[] };
    };
    assert.deepEqual(body.data.contexts, []);
    assert.deepEqual(body.data.availablePortals, []);
  } finally {
    __authTestHooks.reset();
    __authContextsTestHooks.reset();
    restore();
  }
});

test("orgSessionContextsGet exposes internal portal bootstrap option", async () => {
  const oldMode = process.env.AUTH_MODE;
  process.env.AUTH_MODE = "mock";
  __authContextsTestHooks.setContextLoaderOverride(async () => []);

  try {
    const event = makeEvent();
    event.headers["x-role"] = "internal_admin";
    event.headers["x-tenant-id"] = "";

    const result = asStructuredResult(await handler(event, {} as never, () => undefined));
    assert.equal(result.statusCode, 200);
    const body = JSON.parse(result.body as string) as {
      data: {
        canAccessInternalPortal: boolean;
        availablePortals: string[];
        selectionRequired: boolean;
        suggestedContext: { tenantId: string | null; role: string; portal: string } | null;
      };
    };
    assert.equal(body.data.canAccessInternalPortal, true);
    assert.deepEqual(body.data.availablePortals, ["internal"]);
    assert.equal(body.data.selectionRequired, false);
    assert.deepEqual(body.data.suggestedContext, {
      tenantId: null,
      role: "internal_admin",
      portal: "internal"
    });
  } finally {
    __authContextsTestHooks.reset();
    process.env.AUTH_MODE = oldMode;
  }
});
