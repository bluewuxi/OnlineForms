import test from "node:test";
import assert from "node:assert/strict";
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import { handler as listHandler } from "../services/api/src/handlers/internalTenantsList";
import { handler as updateHandler } from "../services/api/src/handlers/internalTenantsUpdate";

function asStructuredResult(
  result: Awaited<ReturnType<typeof listHandler>>
): APIGatewayProxyStructuredResultV2 {
  if (!result || typeof result === "string") {
    throw new Error("Expected structured lambda response.");
  }
  return result;
}

function makeEvent(
  path: string,
  method: "GET" | "PATCH",
  headers?: Record<string, string>,
  pathParameters?: Record<string, string>,
  queryStringParameters?: Record<string, string>,
  body?: unknown
): APIGatewayProxyEventV2 {
  return {
    version: "2.0",
    routeKey: `${method} ${path}`,
    rawPath: path,
    rawQueryString: "",
    headers: headers ?? {},
    pathParameters,
    queryStringParameters,
    body: body === undefined ? undefined : JSON.stringify(body),
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
      requestId: "req_internal_tenants",
      routeKey: `${method} ${path}`,
      stage: "v1",
      time: "20/Mar/2026:00:00:00 +0000",
      timeEpoch: 0
    },
    isBase64Encoded: false
  };
}

test("internalTenantsList rejects invalid limit", async () => {
  const oldMode = process.env.AUTH_MODE;
  process.env.AUTH_MODE = "mock";
  try {
    const result = asStructuredResult(
      await listHandler(
        makeEvent(
          "/internal/tenants",
          "GET",
          { "x-role": "internal_admin", "x-user-id": "usr_1" },
          undefined,
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

test("internalTenantsList denies non-internal roles", async () => {
  const oldMode = process.env.AUTH_MODE;
  process.env.AUTH_MODE = "mock";
  try {
    const result = asStructuredResult(
      await listHandler(
        makeEvent("/internal/tenants", "GET", {
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

test("internalTenantsUpdate returns 400 when tenantId path is missing", async () => {
  const oldMode = process.env.AUTH_MODE;
  process.env.AUTH_MODE = "mock";
  try {
    const result = asStructuredResult(
      await updateHandler(
        makeEvent(
          "/internal/tenants/",
          "PATCH",
          { "x-role": "internal_admin", "x-user-id": "usr_1" },
          {} as never,
          undefined,
          { displayName: "Demo" }
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
