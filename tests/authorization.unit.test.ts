import test from "node:test";
import assert from "node:assert/strict";
import { authorizeOrgAction } from "../services/api/src/lib/authorization";
import type { AuthContext } from "../services/api/src/lib/auth";
import { ApiError } from "../services/api/src/lib/errors";

function asApiError(error: unknown): ApiError {
  assert.ok(error instanceof ApiError);
  return error;
}

function auth(role: AuthContext["role"], tenantId = "ten_1"): AuthContext {
  return {
    userId: "usr_1",
    tenantId,
    role,
    email: null,
    emailVerified: false,
    claims: {}
  };
}

test("authorizeOrgAction allows org_admin/editor for tenant-scoped course actions", () => {
  assert.doesNotThrow(() => authorizeOrgAction(auth("org_admin"), "ORG_COURSE_WRITE", "ten_1"));
  assert.doesNotThrow(() => authorizeOrgAction(auth("org_editor"), "ORG_COURSE_READ", "ten_1"));
});

test("authorizeOrgAction denies cross-tenant requests for non-platform roles", () => {
  assert.throws(
    () => authorizeOrgAction(auth("org_admin", "ten_a"), "ORG_COURSE_READ", "ten_b"),
    (error: unknown) => {
      const apiError = asApiError(error);
      assert.equal(apiError.statusCode, 403);
      assert.equal(apiError.code, "FORBIDDEN");
      return true;
    }
  );
});

test("authorizeOrgAction limits platform_admin bypass to approved actions", () => {
  assert.doesNotThrow(() =>
    authorizeOrgAction(auth("platform_admin", "ten_a"), "ORG_TENANT_CHECK", "ten_b")
  );
  assert.throws(
    () => authorizeOrgAction(auth("platform_admin", "ten_a"), "ORG_SUBMISSION_READ", "ten_b"),
    (error: unknown) => {
      const apiError = asApiError(error);
      assert.equal(apiError.statusCode, 403);
      assert.equal(apiError.code, "FORBIDDEN");
      return true;
    }
  );
});

test("authorizeOrgAction allows internal tenant actions for internal_admin without tenant match", () => {
  assert.doesNotThrow(() =>
    authorizeOrgAction(auth("internal_admin", "__internal__"), "INTERNAL_TENANT_READ", "ten_b")
  );
  assert.doesNotThrow(() =>
    authorizeOrgAction(auth("internal_admin", "__internal__"), "INTERNAL_TENANT_WRITE", "ten_a")
  );
});

test("authorizeOrgAction allows ORG_ME_READ for internal_admin", () => {
  assert.doesNotThrow(() => authorizeOrgAction(auth("internal_admin", "__internal__"), "ORG_ME_READ"));
});
