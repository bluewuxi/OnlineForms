import test from "node:test";
import assert from "node:assert/strict";
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import { handler as getHandler } from "../services/api/src/handlers/orgSubmissionsGet";
import { handler as listHandler } from "../services/api/src/handlers/orgSubmissionsList";
import { handler as updateHandler } from "../services/api/src/handlers/orgSubmissionsUpdate";

function asStructuredResult(
  result: Awaited<ReturnType<typeof getHandler>>
): APIGatewayProxyStructuredResultV2 {
  if (!result || typeof result === "string") throw new Error("Expected structured lambda response.");
  return result;
}

function baseContext(path: string, method: string, requestId: string) {
  return {
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
    requestId,
    routeKey: `${method} ${path}`,
    stage: "v1",
    time: "10/Mar/2026:00:00:00 +0000",
    timeEpoch: 0
  };
}

test("orgSubmissionsList returns 400 for invalid status filter", async () => {
  const oldMode = process.env.AUTH_MODE;
  process.env.AUTH_MODE = "mock";
  try {
    const event = {
      version: "2.0",
      routeKey: "GET /org/submissions",
      rawPath: "/org/submissions",
      rawQueryString: "status=bad",
      queryStringParameters: { status: "bad" },
      headers: {
        "x-user-id": "usr_1",
        "x-tenant-id": "ten_1",
        "x-role": "org_admin"
      },
      requestContext: baseContext("/org/submissions", "GET", "req_sub_list"),
      isBase64Encoded: false
    } as APIGatewayProxyEventV2;

    const result = asStructuredResult(await listHandler(event, {} as never, () => undefined));
    assert.equal(result.statusCode, 400);
  } finally {
    process.env.AUTH_MODE = oldMode;
  }
});

test("orgSubmissionsGet returns 400 when submissionId path is missing", async () => {
  const oldMode = process.env.AUTH_MODE;
  process.env.AUTH_MODE = "mock";
  try {
    const event = {
      version: "2.0",
      routeKey: "GET /org/submissions/{submissionId}",
      rawPath: "/org/submissions/",
      rawQueryString: "",
      headers: {
        "x-user-id": "usr_1",
        "x-tenant-id": "ten_1",
        "x-role": "org_admin"
      },
      requestContext: baseContext("/org/submissions/{submissionId}", "GET", "req_sub_get"),
      isBase64Encoded: false
    } as APIGatewayProxyEventV2;

    const result = asStructuredResult(await getHandler(event, {} as never, () => undefined));
    assert.equal(result.statusCode, 400);
  } finally {
    process.env.AUTH_MODE = oldMode;
  }
});

test("orgSubmissionsUpdate returns 400 when submissionId path is missing", async () => {
  const oldMode = process.env.AUTH_MODE;
  process.env.AUTH_MODE = "mock";
  try {
    const event = {
      version: "2.0",
      routeKey: "PATCH /org/submissions/{submissionId}",
      rawPath: "/org/submissions/",
      rawQueryString: "",
      body: JSON.stringify({ status: "reviewed" }),
      headers: {
        "content-type": "application/json",
        "x-user-id": "usr_1",
        "x-tenant-id": "ten_1",
        "x-role": "org_admin"
      },
      requestContext: baseContext("/org/submissions/{submissionId}", "PATCH", "req_sub_patch"),
      isBase64Encoded: false
    } as APIGatewayProxyEventV2;

    const result = asStructuredResult(await updateHandler(event, {} as never, () => undefined));
    assert.equal(result.statusCode, 400);
  } finally {
    process.env.AUTH_MODE = oldMode;
  }
});
