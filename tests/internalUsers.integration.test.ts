import test from "node:test";
import assert from "node:assert/strict";
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import { handler as listHandler } from "../services/api/src/handlers/internalUsersList";
import { handler as getHandler } from "../services/api/src/handlers/internalUsersGet";
import { handler as createHandler } from "../services/api/src/handlers/internalUsersCreate";
import { handler as deleteHandler } from "../services/api/src/handlers/internalUsersDelete";
import { __internalAccessUsersTestHooks } from "../services/api/src/lib/internalAccessUsers";
import { ApiError } from "../services/api/src/lib/errors";

function asStructuredResult(
  result: Awaited<ReturnType<typeof listHandler>>
): APIGatewayProxyStructuredResultV2 {
  if (!result || typeof result === "string") {
    throw new Error("Expected structured lambda response.");
  }
  return result;
}

function makeEvent(
  method: "GET" | "POST" | "DELETE",
  path: string,
  opts?: {
    headers?: Record<string, string>;
    query?: Record<string, string>;
    pathParameters?: Record<string, string>;
    body?: string;
  }
): APIGatewayProxyEventV2 {
  return {
    version: "2.0",
    routeKey: `${method} ${path}`,
    rawPath: path,
    rawQueryString: "",
    headers: opts?.headers ?? {},
    queryStringParameters: opts?.query,
    pathParameters: opts?.pathParameters,
    body: opts?.body,
    requestContext: {
      accountId: "123456789012",
      apiId: "api",
      domainName: "example.com",
      domainPrefix: "example",
      http: {
        method,
        path,
        protocol: "HTTP/1.1",
        sourceIp: "127.0.0.1",
        userAgent: "node-test"
      },
      requestId: "req_internal_users",
      routeKey: `${method} ${path}`,
      stage: "v1",
      time: "23/Mar/2026:00:00:00 +0000",
      timeEpoch: 0
    },
    isBase64Encoded: false
  };
}

const internalHeaders = {
  "x-role": "internal_admin",
  "x-user-id": "usr_internal_1"
};

test("internalUsersList denies non-internal roles", async () => {
  const oldMode = process.env.AUTH_MODE;
  process.env.AUTH_MODE = "mock";
  try {
    const result = asStructuredResult(
      await listHandler(
        makeEvent("GET", "/internal/users", {
          headers: {
            "x-role": "org_admin",
            "x-user-id": "usr_1",
            "x-tenant-id": "ten_1"
          }
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

test("internalUsersGet returns detail payload", async () => {
  const oldMode = process.env.AUTH_MODE;
  process.env.AUTH_MODE = "mock";
  __internalAccessUsersTestHooks.setUserOpsOverride({
    get: async (userId: string) => ({
      userId,
      username: userId,
      email: "internal@example.com",
      enabled: true,
      status: "CONFIRMED",
      memberships: [
        {
          tenantId: "001",
          status: "active",
          roles: ["org_admin"]
        }
      ]
    })
  });
  try {
    const result = asStructuredResult(
      await getHandler(
        makeEvent("GET", "/internal/users/{userId}", {
          headers: internalHeaders,
          pathParameters: { userId: "usr_internal_1" }
        }),
        {} as never,
        () => undefined
      )
    );
    assert.equal(result.statusCode, 200);
    const body = JSON.parse(result.body as string) as {
      data: { userId: string; memberships: Array<{ tenantId: string }> };
    };
    assert.equal(body.data.userId, "usr_internal_1");
    assert.equal(body.data.memberships.length, 1);
  } finally {
    __internalAccessUsersTestHooks.reset();
    process.env.AUTH_MODE = oldMode;
  }
});

test("internalUsersCreate validates email is required", async () => {
  const oldMode = process.env.AUTH_MODE;
  process.env.AUTH_MODE = "mock";
  try {
    const result = asStructuredResult(
      await createHandler(
        makeEvent("POST", "/internal/users", {
          headers: internalHeaders,
          body: JSON.stringify({})
        }),
        {} as never,
        () => undefined
      )
    );
    assert.equal(result.statusCode, 400);
  } finally {
    process.env.AUTH_MODE = oldMode;
  }
});

test("internalUsersCreate denies non-internal roles", async () => {
  const oldMode = process.env.AUTH_MODE;
  process.env.AUTH_MODE = "mock";
  try {
    const result = asStructuredResult(
      await createHandler(
        makeEvent("POST", "/internal/users", {
          headers: {
            "x-role": "org_editor",
            "x-user-id": "usr_2",
            "x-tenant-id": "ten_1"
          },
          body: JSON.stringify({ email: "user@example.com" })
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

test("internalUsersCreate returns 404 when email user is not found", async () => {
  const oldMode = process.env.AUTH_MODE;
  process.env.AUTH_MODE = "mock";
  __internalAccessUsersTestHooks.setUserOpsOverride({
    addByEmail: async () => {
      throw new ApiError(404, "NOT_FOUND", "User with the given email was not found.");
    }
  });
  try {
    const result = asStructuredResult(
      await createHandler(
        makeEvent("POST", "/internal/users", {
          headers: internalHeaders,
          body: JSON.stringify({ email: "none@example.com" })
        }),
        {} as never,
        () => undefined
      )
    );
    assert.equal(result.statusCode, 404);
  } finally {
    __internalAccessUsersTestHooks.reset();
    process.env.AUTH_MODE = oldMode;
  }
});

test("internalUsersDelete removes internal access", async () => {
  const oldMode = process.env.AUTH_MODE;
  process.env.AUTH_MODE = "mock";
  __internalAccessUsersTestHooks.setUserOpsOverride({
    remove: async (userId: string) => ({ userId, removed: true })
  });
  try {
    const result = asStructuredResult(
      await deleteHandler(
        makeEvent("DELETE", "/internal/users/{userId}", {
          headers: internalHeaders,
          pathParameters: { userId: "usr_internal_1" }
        }),
        {} as never,
        () => undefined
      )
    );
    assert.equal(result.statusCode, 200);
  } finally {
    __internalAccessUsersTestHooks.reset();
    process.env.AUTH_MODE = oldMode;
  }
});

test("internalUsersDelete returns conflict when user has no internal access", async () => {
  const oldMode = process.env.AUTH_MODE;
  process.env.AUTH_MODE = "mock";
  __internalAccessUsersTestHooks.setUserOpsOverride({
    remove: async () => {
      throw new ApiError(409, "CONFLICT", "User does not currently have internal access.");
    }
  });
  try {
    const result = asStructuredResult(
      await deleteHandler(
        makeEvent("DELETE", "/internal/users/{userId}", {
          headers: internalHeaders,
          pathParameters: { userId: "usr_internal_2" }
        }),
        {} as never,
        () => undefined
      )
    );
    assert.equal(result.statusCode, 409);
  } finally {
    __internalAccessUsersTestHooks.reset();
    process.env.AUTH_MODE = oldMode;
  }
});
