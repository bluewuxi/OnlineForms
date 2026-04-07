import test from "node:test";
import assert from "node:assert/strict";
import { ApiError } from "../services/api/src/lib/errors";
import { verifyCaptcha, __captchaTestHooks } from "../services/api/src/lib/captcha";

const MOCK_IP = "203.0.113.42";
const VALID_TOKEN = "test-valid-token";
const INVALID_TOKEN = "test-invalid-token";

function asApiError(error: unknown): ApiError {
  assert.ok(error instanceof ApiError);
  return error;
}

test.afterEach(() => {
  __captchaTestHooks.reset();
});

test("verifyCaptcha resolves when token is valid", async () => {
  __captchaTestHooks.setVerifyOverride(async (token) => token === VALID_TOKEN);

  await assert.doesNotReject(() => verifyCaptcha(VALID_TOKEN, MOCK_IP));
});

test("verifyCaptcha throws 403 CAPTCHA_FAILED when token is invalid", async () => {
  __captchaTestHooks.setVerifyOverride(async (token) => token === VALID_TOKEN);

  const error = await verifyCaptcha(INVALID_TOKEN, MOCK_IP).catch((e) => e);
  const apiError = asApiError(error);

  assert.equal(apiError.statusCode, 403);
  assert.equal(apiError.code, "CAPTCHA_FAILED");
  assert.match(apiError.message, /captcha verification failed/i);
});

test("verifyCaptcha throws 403 CAPTCHA_FAILED when token is missing", async () => {
  __captchaTestHooks.setVerifyOverride(async () => false);

  const error = await verifyCaptcha(undefined, MOCK_IP).catch((e) => e);
  const apiError = asApiError(error);

  assert.equal(apiError.statusCode, 403);
  assert.equal(apiError.code, "CAPTCHA_FAILED");
});

test("verifyCaptcha skips verification when TURNSTILE_ENABLED=false", async () => {
  process.env.TURNSTILE_ENABLED = "false";

  let overrideCalled = false;
  __captchaTestHooks.setVerifyOverride(async () => {
    overrideCalled = true;
    return false; // would reject if called
  });

  await assert.doesNotReject(() => verifyCaptcha(undefined, MOCK_IP));
  assert.equal(overrideCalled, false, "Verify should not be called when disabled");
});
