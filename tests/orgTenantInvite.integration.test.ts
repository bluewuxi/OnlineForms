import test from "node:test";
import assert from "node:assert/strict";
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import { handler as createInviteHandler } from "../services/api/src/handlers/orgTenantInviteCreate";
import { handler as acceptInviteHandler } from "../services/api/src/handlers/orgTenantInviteAccept";

function asStructuredResult(
  result: Awaited<ReturnType<typeof createInviteHandler>>
): APIGatewayProxyStructuredResultV2 {
  if (!result || typeof result === "string") {
    throw new Error("Expected structured lambda response.");
  }
  assert.ok("statusCode" in result);
  return result;
}

function makeEvent(path: string, pathParameters?: Record<string, string>, body?: unknown): APIGatewayProxyEventV2 {
  return {
    version: "2.0",
    routeKey: "POST /org/tenants/{tenantId}/invites",
    rawPath: path,
    rawQueryString: "",
    headers: {
      "x-user-id": "usr_1",
      "x-tenant-id": "ten_1",
      "x-role": "org_admin",
      "x-user-email": "admin@example.com",
      "x-email-verified": "true"
    },
    pathParameters,
    body: body === undefined ? undefined : JSON.stringify(body),
    requestContext: {
      accountId: "123456789012",
      apiId: "api",
      domainName: "example.com",
      domainPrefix: "example",
      http: {
        method: "POST",
        path,
        protocol: "HTTP/1.1",
        sourceIp: "127.0.0.1",
        userAgent: "node-test"
      },
      requestId: "req_invite",
      routeKey: "POST /org/tenants/{tenantId}/invites",
      stage: "v1",
      time: "10/Mar/2026:00:00:00 +0000",
      timeEpoch: 0
    },
    isBase64Encoded: false
  };
}

test("orgTenantInviteCreate returns 400 when tenantId path is missing", async () => {
  const oldMode = process.env.AUTH_MODE;
  process.env.AUTH_MODE = "mock";
  try {
    const result = asStructuredResult(
      await createInviteHandler(makeEvent("/org/tenants//invites"), {} as never, () => undefined)
    );
    assert.equal(result.statusCode, 400);
  } finally {
    process.env.AUTH_MODE = oldMode;
  }
});

test("orgTenantInviteCreate returns 400 when body is missing", async () => {
  const oldMode = process.env.AUTH_MODE;
  process.env.AUTH_MODE = "mock";
  try {
    const result = asStructuredResult(
      await createInviteHandler(
        makeEvent("/org/tenants/ten_1/invites", { tenantId: "ten_1" }),
        {} as never,
        () => undefined
      )
    );
    assert.equal(result.statusCode, 400);
  } finally {
    process.env.AUTH_MODE = oldMode;
  }
});

test("orgTenantInviteAccept returns 400 when inviteId path is missing", async () => {
  const oldMode = process.env.AUTH_MODE;
  process.env.AUTH_MODE = "mock";
  try {
    const result = asStructuredResult(
      await acceptInviteHandler(
        makeEvent("/org/tenants/ten_1/invites//accept", { tenantId: "ten_1" }),
        {} as never,
        () => undefined
      )
    );
    assert.equal(result.statusCode, 400);
  } finally {
    process.env.AUTH_MODE = oldMode;
  }
});

test("orgTenantInviteCreate returns 400 when role is invalid for invite", async () => {
  const oldMode = process.env.AUTH_MODE;
  process.env.AUTH_MODE = "mock";
  try {
    const result = asStructuredResult(
      await createInviteHandler(
        makeEvent("/org/tenants/ten_1/invites", { tenantId: "ten_1" }, {
          email: "viewer@example.com",
          role: "platform_support"
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

test("orgTenantInviteCreate accepts org_viewer role", async () => {
  const oldMode = process.env.AUTH_MODE;
  process.env.AUTH_MODE = "mock";
  try {
    const result = asStructuredResult(
      await createInviteHandler(
        makeEvent("/org/tenants/ten_1/invites", { tenantId: "ten_1" }, {
          email: "viewer@example.com",
          role: "org_viewer"
        }),
        {} as never,
        () => undefined
      )
    );
    // DynamoDB is not available in unit test — expect 500 from missing table, not 400 validation error
    assert.notEqual(result.statusCode, 400);
  } finally {
    process.env.AUTH_MODE = oldMode;
  }
});

test("orgTenantInviteAccept returns 403 when authenticated email is missing", async () => {
  const oldMode = process.env.AUTH_MODE;
  process.env.AUTH_MODE = "mock";
  try {
    const event = makeEvent("/org/tenants/ten_1/invites/inv_1/accept", {
      tenantId: "ten_1",
      inviteId: "inv_1"
    });
    delete event.headers["x-user-email"];
    delete event.headers["x-email-verified"];
    const result = asStructuredResult(
      await acceptInviteHandler(event, {} as never, () => undefined)
    );
    assert.equal(result.statusCode, 403);
    assert.match(String(result.body), /verified authenticated email/i);
  } finally {
    process.env.AUTH_MODE = oldMode;
  }
});
