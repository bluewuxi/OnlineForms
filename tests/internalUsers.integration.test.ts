import test from "node:test";
import assert from "node:assert/strict";
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import { handler as listHandler } from "../services/api/src/handlers/internalUsersList";
import { handler as getHandler } from "../services/api/src/handlers/internalUsersGet";
import { handler as createHandler } from "../services/api/src/handlers/internalUsersCreate";
import { handler as activateHandler } from "../services/api/src/handlers/internalUsersActivate";
import { handler as deactivateHandler } from "../services/api/src/handlers/internalUsersDeactivate";
import { handler as roleAddHandler } from "../services/api/src/handlers/internalUsersRoleAdd";
import { handler as roleRemoveHandler } from "../services/api/src/handlers/internalUsersRoleRemove";
import { handler as passwordResetHandler } from "../services/api/src/handlers/internalUsersPasswordReset";
import { handler as activityListHandler } from "../services/api/src/handlers/internalUsersActivityList";
import { handler as logoutHandler } from "../services/api/src/handlers/internalUsersLogout";
import { handler as sessionContextValidateHandler } from "../services/api/src/handlers/orgSessionContextValidate";
import {
  __internalAccessUsersTestHooks,
  type InternalAccessUser,
  type InternalAccessUserDetail,
} from "../services/api/src/lib/internalAccessUsers";
import { __internalUserActivityTestHooks } from "../services/api/src/lib/internalUserActivity";
import { __authContextsTestHooks } from "../services/api/src/lib/authContexts";

function asStructuredResult(
  result: Awaited<ReturnType<typeof listHandler>>,
): APIGatewayProxyStructuredResultV2 {
  if (!result || typeof result === "string") {
    throw new Error("Expected structured lambda response.");
  }
  return result;
}

function makeEvent(
  method: "GET" | "POST",
  path: string,
  opts?: {
    headers?: Record<string, string>;
    query?: Record<string, string>;
    pathParameters?: Record<string, string>;
    body?: string;
  },
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
        userAgent: "node-test",
      },
      requestId: "req_internal_users",
      routeKey: `${method} ${path}`,
      stage: "v1",
      time: "23/Mar/2026:00:00:00 +0000",
      timeEpoch: 0,
    },
    isBase64Encoded: false,
  };
}

const internalHeaders = {
  "x-role": "internal_admin",
  "x-user-id": "usr_internal_1",
};

const baseUser: InternalAccessUser = {
  userId: "usr_internal_2",
  username: "internal@example.com",
  email: "internal@example.com",
  preferredName: "Internal Example",
  enabled: true,
  status: "CONFIRMED",
  internalRoles: ["internal_admin"],
};

test.afterEach(() => {
  __internalAccessUsersTestHooks.reset();
  __internalUserActivityTestHooks.reset();
  __authContextsTestHooks.reset();
  delete process.env.AUTH_MODE;
  delete process.env.ONLINEFORMS_INTERNAL_ACTIVITY_TABLE;
});

test.beforeEach(() => {
  process.env.ONLINEFORMS_INTERNAL_ACTIVITY_TABLE = "onlineforms-internal-activity";
  __internalUserActivityTestHooks.setWriteOverride(async () => {});
});

test("internalUsersList denies non-internal roles", async () => {
  process.env.AUTH_MODE = "mock";
  const result = asStructuredResult(
    await listHandler(
      makeEvent("GET", "/internal/users", {
        headers: {
          "x-role": "org_admin",
          "x-user-id": "usr_1",
          "x-tenant-id": "ten_1",
        },
      }),
      {} as never,
      () => undefined,
    ),
  );
  assert.equal(result.statusCode, 403);
});

test("internalUsersList returns canonical directory data", async () => {
  process.env.AUTH_MODE = "mock";
  __internalAccessUsersTestHooks.setLoaderOverride(async () => ({
    data: [baseUser],
    page: { limit: 50, nextCursor: null },
  }));
  const result = asStructuredResult(
    await listHandler(
      makeEvent("GET", "/internal/users", { headers: internalHeaders }),
      {} as never,
      () => undefined,
    ),
  );
  assert.equal(result.statusCode, 200);
  const body = JSON.parse(result.body as string) as {
    data: Array<{ userId: string; internalRoles: string[] }>;
  };
  assert.equal(body.data[0].userId, baseUser.userId);
  assert.deepEqual(body.data[0].internalRoles, ["internal_admin"]);
});

test("internalUsersGet returns detail payload", async () => {
  process.env.AUTH_MODE = "mock";
  __internalAccessUsersTestHooks.setUserOpsOverride({
    get: async (userId: string): Promise<InternalAccessUserDetail> => ({
      ...baseUser,
      userId,
      memberships: [
        {
          tenantId: "001",
          status: "active",
          roles: ["org_admin"],
        },
      ],
    }),
  });
  const result = asStructuredResult(
    await getHandler(
      makeEvent("GET", "/internal/users/{userId}", {
        headers: internalHeaders,
        pathParameters: { userId: baseUser.userId },
      }),
      {} as never,
      () => undefined,
    ),
  );
  assert.equal(result.statusCode, 200);
});

test("internalUsersCreate returns created user and writes activity", async () => {
  process.env.AUTH_MODE = "mock";
  let wroteActivity = false;
  __internalAccessUsersTestHooks.setUserOpsOverride({
    create: async (): Promise<InternalAccessUser> => baseUser,
  });
  __internalUserActivityTestHooks.setWriteOverride(async () => {
    wroteActivity = true;
  });
  const result = asStructuredResult(
    await createHandler(
      makeEvent("POST", "/internal/users", {
        headers: internalHeaders,
        body: JSON.stringify({
          email: baseUser.email,
          password: "TempPassword1",
          internalRoles: ["internal_admin"],
          temporaryPassword: false,
          enabled: true,
        }),
      }),
      {} as never,
      () => undefined,
    ),
  );
  assert.equal(result.statusCode, 201);
  assert.equal(wroteActivity, true);
});

test("internalUsersActivate updates user", async () => {
  process.env.AUTH_MODE = "mock";
  __internalAccessUsersTestHooks.setUserOpsOverride({
    activate: async (): Promise<InternalAccessUser> => ({ ...baseUser, enabled: true }),
  });
  const result = asStructuredResult(
    await activateHandler(
      makeEvent("POST", "/internal/users/{userId}/activate", {
        headers: internalHeaders,
        pathParameters: { userId: baseUser.userId },
      }),
      {} as never,
      () => undefined,
    ),
  );
  assert.equal(result.statusCode, 200);
});

test("internalUsersDeactivate updates user", async () => {
  process.env.AUTH_MODE = "mock";
  __internalAccessUsersTestHooks.setUserOpsOverride({
    deactivate: async (): Promise<InternalAccessUser> => ({ ...baseUser, enabled: false }),
  });
  const result = asStructuredResult(
    await deactivateHandler(
      makeEvent("POST", "/internal/users/{userId}/deactivate", {
        headers: internalHeaders,
        pathParameters: { userId: baseUser.userId },
      }),
      {} as never,
      () => undefined,
    ),
  );
  assert.equal(result.statusCode, 200);
});

test("internalUsersRoleAdd mutates explicit role", async () => {
  process.env.AUTH_MODE = "mock";
  __internalAccessUsersTestHooks.setUserOpsOverride({
    addRole: async (): Promise<InternalAccessUser> => ({
      ...baseUser,
      internalRoles: ["internal_admin", "platform_admin"],
    }),
  });
  const result = asStructuredResult(
    await roleAddHandler(
      makeEvent("POST", "/internal/users/{userId}/roles/add", {
        headers: internalHeaders,
        pathParameters: { userId: baseUser.userId },
        body: JSON.stringify({ role: "platform_admin" }),
      }),
      {} as never,
      () => undefined,
    ),
  );
  assert.equal(result.statusCode, 200);
});

test("internalUsersRoleRemove mutates explicit role", async () => {
  process.env.AUTH_MODE = "mock";
  __internalAccessUsersTestHooks.setUserOpsOverride({
    removeRole: async (): Promise<InternalAccessUser> => baseUser,
  });
  const result = asStructuredResult(
    await roleRemoveHandler(
      makeEvent("POST", "/internal/users/{userId}/roles/remove", {
        headers: internalHeaders,
        pathParameters: { userId: baseUser.userId },
        body: JSON.stringify({ role: "internal_admin" }),
      }),
      {} as never,
      () => undefined,
    ),
  );
  assert.equal(result.statusCode, 200);
});

test("internalUsersPasswordReset returns temporary password contract", async () => {
  process.env.AUTH_MODE = "mock";
  __internalAccessUsersTestHooks.setUserOpsOverride({
    resetPassword: async (userId: string) => ({
      userId,
      passwordReset: true,
      temporaryPassword: true,
    }),
  });
  const result = asStructuredResult(
    await passwordResetHandler(
      makeEvent("POST", "/internal/users/{userId}/password-reset", {
        headers: internalHeaders,
        pathParameters: { userId: baseUser.userId },
        body: JSON.stringify({ password: "TempPassword1" }),
      }),
      {} as never,
      () => undefined,
    ),
  );
  assert.equal(result.statusCode, 200);
});

test("internalUsersActivityList exposes source status", async () => {
  process.env.AUTH_MODE = "mock";
  __internalUserActivityTestHooks.setListOverride(async () => ({
    data: [
      {
        id: "act_1",
        userId: baseUser.userId,
        actorUserId: "usr_internal_1",
        eventType: "internal_user.created",
        summary: "created",
        details: {},
        createdAt: "2026-03-26T00:00:00.000Z",
      },
    ],
    page: { limit: 20, nextCursor: null },
    sourceStatus: "ok",
  }));
  const result = asStructuredResult(
    await activityListHandler(
      makeEvent("GET", "/internal/users/{userId}/activity", {
        headers: internalHeaders,
        pathParameters: { userId: baseUser.userId },
      }),
      {} as never,
      () => undefined,
    ),
  );
  assert.equal(result.statusCode, 200);
});

test("internalUsersLogout writes logout activity", async () => {
  process.env.AUTH_MODE = "mock";
  let wroteActivity = false;
  __internalUserActivityTestHooks.setWriteOverride(async () => {
    wroteActivity = true;
  });
  const result = asStructuredResult(
    await logoutHandler(
      makeEvent("POST", "/internal/users/activity/logout", { headers: internalHeaders }),
      {} as never,
      () => undefined,
    ),
  );
  assert.equal(result.statusCode, 200);
  assert.equal(wroteActivity, true);
});

test("orgSessionContextValidate writes login activity for internal access", async () => {
  process.env.AUTH_MODE = "mock";
  let wroteActivity = false;
  __internalUserActivityTestHooks.setWriteOverride(async () => {
    wroteActivity = true;
  });
  const result = asStructuredResult(
    await sessionContextValidateHandler(
      makeEvent("POST", "/org/session-context", {
        headers: internalHeaders,
        body: JSON.stringify({ role: "internal_admin" }),
      }),
      {} as never,
      () => undefined,
    ),
  );
  assert.equal(result.statusCode, 200);
  assert.equal(wroteActivity, true);
});
