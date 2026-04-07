import test from "node:test";
import assert from "node:assert/strict";
import { UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { ApiError } from "../services/api/src/lib/errors";
import { checkRateLimit, __rateLimitTestHooks } from "../services/api/src/lib/rateLimit";

const MOCK_IP = "203.0.113.42";

function asApiError(error: unknown): ApiError {
  assert.ok(error instanceof ApiError);
  return error;
}

test.afterEach(() => {
  __rateLimitTestHooks.reset();
  delete process.env.AUTH_MODE;
});

test("checkRateLimit succeeds when DynamoDB UpdateItem completes without error", async () => {
  __rateLimitTestHooks.setDdbSendOverride(async (command) => {
    assert.ok(command instanceof UpdateCommand, "Expected an UpdateCommand");
    // Simulate a successful conditional update (counter incremented, below limit)
    return {};
  });

  // Should resolve without throwing
  await assert.doesNotReject(() => checkRateLimit(MOCK_IP));
});

test("checkRateLimit throws 429 RATE_LIMITED when ConditionalCheckFailedException is returned", async () => {
  __rateLimitTestHooks.setDdbSendOverride(async () => {
    const err = new Error("The conditional request failed");
    err.name = "ConditionalCheckFailedException";
    throw err;
  });

  const error = await checkRateLimit(MOCK_IP).catch((e) => e);
  const apiError = asApiError(error);

  assert.equal(apiError.statusCode, 429);
  assert.equal(apiError.code, "RATE_LIMITED");
  assert.match(apiError.message, /too many submissions/i);
  assert.ok(
    typeof apiError.retryAfter === "number" && apiError.retryAfter > 0,
    "retryAfter should be a positive number of seconds"
  );
  assert.ok(apiError.retryAfter! <= 3600, "retryAfter should be <= 3600 seconds");
});

test("checkRateLimit uses correct DynamoDB key format including hour bucket", async () => {
  const capturedKeys: Array<{ PK: string }> = [];

  __rateLimitTestHooks.setDdbSendOverride(async (command) => {
    assert.ok(command instanceof UpdateCommand);
    capturedKeys.push(command.input.Key as { PK: string });
    return {};
  });

  await checkRateLimit(MOCK_IP);

  assert.equal(capturedKeys.length, 1);
  const key = capturedKeys[0].PK;
  const hourBucket = Math.floor(Date.now() / 3_600_000);
  assert.equal(key, `RATELIMIT#${MOCK_IP}#${hourBucket}`);
});

test("checkRateLimit sets expiresAt TTL in the UpdateExpression", async () => {
  let capturedValues: Record<string, unknown> = {};

  __rateLimitTestHooks.setDdbSendOverride(async (command) => {
    assert.ok(command instanceof UpdateCommand);
    capturedValues = command.input.ExpressionAttributeValues as Record<string, unknown>;
    return {};
  });

  await checkRateLimit(MOCK_IP);

  const expiresAt = capturedValues[":expiresAt"] as number;
  const nowSeconds = Math.floor(Date.now() / 1000);
  // expiresAt should be between 1 hour and 2 hours from now
  assert.ok(expiresAt > nowSeconds + 3600, "expiresAt should be more than 1 hour from now");
  assert.ok(expiresAt <= nowSeconds + 7200, "expiresAt should be within 2 hours from now");
});

test("checkRateLimit skips rate limiting when AUTH_MODE=mock", async () => {
  process.env.AUTH_MODE = "mock";

  let ddbCalled = false;
  __rateLimitTestHooks.setDdbSendOverride(async () => {
    ddbCalled = true;
    return {};
  });

  await checkRateLimit(MOCK_IP);

  assert.equal(ddbCalled, false, "DynamoDB should not be called in mock mode");
});

test("checkRateLimit re-throws non-conditional DynamoDB errors", async () => {
  __rateLimitTestHooks.setDdbSendOverride(async () => {
    const err = new Error("ProvisionedThroughputExceededException");
    err.name = "ProvisionedThroughputExceededException";
    throw err;
  });

  const error = await checkRateLimit(MOCK_IP).catch((e) => e);
  assert.ok(!(error instanceof ApiError), "Should not wrap DynamoDB errors as ApiError");
  assert.equal(error.name, "ProvisionedThroughputExceededException");
});
