import test from "node:test";
import assert from "node:assert/strict";
import { ApiError } from "../services/api/src/lib/errors";
import { isReservedTenantCode, normalizeTenantCode } from "../services/api/src/lib/tenantCodes";

test("normalizeTenantCode lowercases and trims valid values", () => {
  const value = normalizeTenantCode("  Std-School ");
  assert.equal(value, "std-school");
});

test("normalizeTenantCode rejects reserved values", () => {
  assert.throws(
    () => normalizeTenantCode("org"),
    (error: unknown) => {
      assert.ok(error instanceof ApiError);
      assert.equal(error.statusCode, 400);
      assert.equal(error.code, "VALIDATION_ERROR");
      assert.match(error.message, /Invalid tenant code/);
      assert.equal(error.details?.[0]?.field, "tenantCode");
      return true;
    }
  );
});

test("normalizeTenantCode rejects invalid characters", () => {
  assert.throws(
    () => normalizeTenantCode("bad code"),
    (error: unknown) => {
      assert.ok(error instanceof ApiError);
      assert.equal(error.statusCode, 400);
      assert.equal(error.code, "VALIDATION_ERROR");
      return true;
    }
  );
});

test("isReservedTenantCode returns true for blocked values", () => {
  assert.equal(isReservedTenantCode("org"), true);
  assert.equal(isReservedTenantCode("ORG"), true);
  assert.equal(isReservedTenantCode("std-school"), false);
});
