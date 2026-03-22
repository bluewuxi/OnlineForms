import test from "node:test";
import assert from "node:assert/strict";
import {
  assertTenantRoleAllowed,
  type UserTenantContext
} from "../services/api/src/lib/authContexts";
import { ApiError } from "../services/api/src/lib/errors";

function asApiError(error: unknown): ApiError {
  assert.ok(error instanceof ApiError);
  return error;
}

const baseContexts: UserTenantContext[] = [
  {
    tenantId: "ten_1",
    status: "active",
    roles: ["org_admin"]
  }
];

test("assertTenantRoleAllowed allows active membership with matching role", () => {
  assert.doesNotThrow(() => assertTenantRoleAllowed(baseContexts, "ten_1", "org_admin"));
});

test("assertTenantRoleAllowed rejects when tenant context is missing", () => {
  assert.throws(
    () => assertTenantRoleAllowed(baseContexts, "ten_2", "org_admin"),
    (error: unknown) => {
      const apiError = asApiError(error);
      assert.equal(apiError.statusCode, 403);
      assert.equal(apiError.code, "FORBIDDEN");
      assert.match(apiError.message, /active membership/i);
      return true;
    }
  );
});

test("assertTenantRoleAllowed rejects suspended membership", () => {
  assert.throws(
    () =>
      assertTenantRoleAllowed(
        [{ tenantId: "ten_1", status: "suspended", roles: ["org_admin"] }],
        "ten_1",
        "org_admin"
      ),
    (error: unknown) => {
      const apiError = asApiError(error);
      assert.equal(apiError.statusCode, 403);
      assert.equal(apiError.code, "FORBIDDEN");
      assert.match(apiError.message, /active membership/i);
      return true;
    }
  );
});

test("assertTenantRoleAllowed rejects disallowed role", () => {
  assert.throws(
    () => assertTenantRoleAllowed(baseContexts, "ten_1", "org_editor"),
    (error: unknown) => {
      const apiError = asApiError(error);
      assert.equal(apiError.statusCode, 403);
      assert.equal(apiError.code, "FORBIDDEN");
      assert.match(apiError.message, /role is not allowed/i);
      return true;
    }
  );
});
