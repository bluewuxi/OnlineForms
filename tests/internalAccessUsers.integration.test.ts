import test from "node:test";
import assert from "node:assert/strict";
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import { handler } from "../services/api/src/handlers/internalAccessUsersList";
import { __internalAccessUsersTestHooks } from "../services/api/src/lib/internalAccessUsers";

function asStructuredResult(
  result: Awaited<ReturnType<typeof handler>>
): APIGatewayProxyStructuredResultV2 {
  if (!result || typeof result === "string") {
    throw new Error("Expected structured lambda response.");
  }
  return result;
}

function makeEvent(
  headers?: Record<string, string>,
  queryStringParameters?: Record<string, string>
): APIGatewayProxyEventV2 {
  return {
    version: "2.0",
    routeKey: "GET /internal/access-users",
    rawPath: "/internal/access-users",
    rawQueryString: "",
    headers: headers ?? {},
    queryStringParameters,
    requestContext: {
      accountId: "123456789012",
      apiId: "api",
      domainName: "example.com",
      domainPrefix: "example",
      http: {
        method: "GET",
        path: "/internal/access-users",
        protocol: "HTTP/1.1",
        sourceIp: "127.0.0.1",
        userAgent: "node-test"
      },
      requestId: "req_internal_access_users",
      routeKey: "GET /internal/access-users",
      stage: "v1",
      time: "22/Mar/2026:00:00:00 +0000",
      timeEpoch: 0
    },
    isBase64Encoded: false
  };
}

test("internalAccessUsersList rejects invalid limit", async () => {
  const oldMode = process.env.AUTH_MODE;
  process.env.AUTH_MODE = "mock";
  try {
    const result = asStructuredResult(
      await handler(
        makeEvent(
          { "x-role": "internal_admin", "x-user-id": "usr_1" },
          { limit: "abc" }
        ),
        {} as never,
        () => undefined
      )
    );
    assert.equal(result.statusCode, 400);
  } finally {
    process.env.AUTH_MODE = oldMode;
  }
});

test("internalAccessUsersList denies non-internal roles", async () => {
  const oldMode = process.env.AUTH_MODE;
  process.env.AUTH_MODE = "mock";
  try {
    const result = asStructuredResult(
      await handler(
        makeEvent({
          "x-role": "org_admin",
          "x-user-id": "usr_1",
          "x-tenant-id": "ten_1"
        }),
        {} as never,
        () => undefined
      )
    );
    assert.equal(result.statusCode, 403);
  } finally {
    process.env.AUTH_MODE = oldMode;
  }
});

test("internalAccessUsersList returns directory data for internal_admin", async () => {
  const oldMode = process.env.AUTH_MODE;
  process.env.AUTH_MODE = "mock";
  __internalAccessUsersTestHooks.setLoaderOverride(async () => ({
    data: [
      {
        userId: "usr_internal_1",
        username: "internal-user-1",
        email: "internal-1@example.com",
        enabled: true,
        status: "CONFIRMED"
      }
    ],
    page: {
      limit: 50,
      nextCursor: null
    }
  }));
  try {
    const result = asStructuredResult(
      await handler(
        makeEvent({
          "x-role": "internal_admin",
          "x-user-id": "usr_1"
        }),
        {} as never,
        () => undefined
      )
    );
    assert.equal(result.statusCode, 200);
    assert.ok(result.body);
    const body = JSON.parse(result.body as string) as {
      data: Array<{ userId: string }>;
      page: { limit: number; nextCursor: string | null };
    };
    assert.equal(body.data.length, 1);
    assert.equal(body.data[0].userId, "usr_internal_1");
    assert.equal(body.page.limit, 50);
  } finally {
    __internalAccessUsersTestHooks.reset();
    process.env.AUTH_MODE = oldMode;
  }
});
