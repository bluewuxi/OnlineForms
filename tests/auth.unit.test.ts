import test from "node:test";
import assert from "node:assert/strict";
import {
  assertTenantAccess,
  authenticateRequest,
  requireAnyRole,
  type AuthContext
} from "../services/api/src/lib/auth";
import { ApiError } from "../services/api/src/lib/errors";

function asApiError(error: unknown): ApiError {
  assert.ok(error instanceof ApiError);
  return error;
}

test("authenticateRequest uses mock headers when AUTH_MODE=mock", async () => {
  const oldMode = process.env.AUTH_MODE;
  process.env.AUTH_MODE = "mock";
  try {
    const auth = await authenticateRequest({
      "x-user-id": "usr_1",
      "x-tenant-id": "ten_1",
      "x-role": "org_admin"
    });
    assert.equal(auth.userId, "usr_1");
    assert.equal(auth.tenantId, "ten_1");
    assert.equal(auth.role, "org_admin");
  } finally {
    process.env.AUTH_MODE = oldMode;
  }
});

test("authenticateRequest rejects missing tenant in mock mode", async () => {
  const oldMode = process.env.AUTH_MODE;
  process.env.AUTH_MODE = "mock";
  try {
    await assert.rejects(
      () => authenticateRequest({ "x-user-id": "usr_1", "x-role": "org_admin" }),
      (error: unknown) => {
        const apiError = asApiError(error);
        assert.equal(apiError.statusCode, 403);
        assert.equal(apiError.code, "FORBIDDEN");
        return true;
      }
    );
  } finally {
    process.env.AUTH_MODE = oldMode;
  }
});

test("authenticateRequest rejects missing bearer token in cognito mode", async () => {
  const oldMode = process.env.AUTH_MODE;
  process.env.AUTH_MODE = "cognito";
  try {
    await assert.rejects(
      () => authenticateRequest({}),
      (error: unknown) => {
        const apiError = asApiError(error);
        assert.equal(apiError.statusCode, 401);
        assert.equal(apiError.code, "UNAUTHORIZED");
        return true;
      }
    );
  } finally {
    process.env.AUTH_MODE = oldMode;
  }
});

test("requireAnyRole rejects non-allowed role", () => {
  const auth: AuthContext = {
    userId: "usr_1",
    tenantId: "ten_1",
    role: "org_editor",
    claims: {}
  };
  assert.throws(
    () => requireAnyRole(auth, ["org_admin"]),
    (error: unknown) => {
      const apiError = asApiError(error);
      assert.equal(apiError.statusCode, 403);
      assert.equal(apiError.code, "FORBIDDEN");
      return true;
    }
  );
});

test("assertTenantAccess denies cross-tenant for org role and allows platform_admin", () => {
  const orgAuth: AuthContext = {
    userId: "usr_1",
    tenantId: "ten_1",
    role: "org_admin",
    claims: {}
  };
  const platformAuth: AuthContext = {
    userId: "usr_2",
    tenantId: "ten_2",
    role: "platform_admin",
    claims: {}
  };

  assert.throws(
    () => assertTenantAccess(orgAuth, "ten_other"),
    (error: unknown) => {
      const apiError = asApiError(error);
      assert.equal(apiError.statusCode, 403);
      assert.equal(apiError.code, "FORBIDDEN");
      return true;
    }
  );
  assert.doesNotThrow(() => assertTenantAccess(platformAuth, "ten_other"));
});
