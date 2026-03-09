import test from "node:test";
import assert from "node:assert/strict";
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import { handler } from "../services/api/src/handlers/paymentsStub";

function asStructuredResult(
  result: Awaited<ReturnType<typeof handler>>
): APIGatewayProxyStructuredResultV2 {
  if (!result || typeof result === "string") throw new Error("Expected structured lambda response.");
  return result;
}

test("paymentsStub returns 409 with payments_disabled marker", async () => {
  const event = {
    version: "2.0",
    routeKey: "POST /payments/checkout-session",
    rawPath: "/payments/checkout-session",
    rawQueryString: "",
    headers: {},
    requestContext: {
      accountId: "123456789012",
      apiId: "api",
      domainName: "example.com",
      domainPrefix: "example",
      http: {
        method: "POST",
        path: "/payments/checkout-session",
        protocol: "HTTP/1.1",
        sourceIp: "127.0.0.1",
        userAgent: "node-test"
      },
      requestId: "req_pay_stub",
      routeKey: "POST /payments/checkout-session",
      stage: "v1",
      time: "10/Mar/2026:00:00:00 +0000",
      timeEpoch: 0
    },
    isBase64Encoded: false
  } as APIGatewayProxyEventV2;

  const result = asStructuredResult(await handler(event, {} as never, () => undefined));
  assert.equal(result.statusCode, 409);
  const body = JSON.parse(result.body as string) as { error: { code: string; details: Array<{ issue: string }> } };
  assert.equal(body.error.code, "CONFLICT");
  assert.ok(body.error.details.some((d) => d.issue === "payments_disabled"));
});
