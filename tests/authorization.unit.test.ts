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

test("authorizeOrgAction allows platform_support bypass on approved read actions", () => {
  assert.doesNotThrow(() =>
    authorizeOrgAction(auth("platform_support", "ten_a"), "ORG_TENANT_CHECK", "ten_b")
  );
  assert.doesNotThrow(() =>
    authorizeOrgAction(auth("platform_support", "ten_a"), "ORG_ME_READ", "ten_b")
  );
});

test("authorizeOrgAction denies platform_support on write actions", () => {
  assert.throws(
    () => authorizeOrgAction(auth("platform_support", "ten_a"), "ORG_COURSE_WRITE", "ten_b"),
    (error: unknown) => {
      const apiError = asApiError(error);
      assert.equal(apiError.statusCode, 403);
      assert.equal(apiError.code, "FORBIDDEN");
      return true;
    }
  );
  assert.throws(
    () => authorizeOrgAction(auth("platform_support", "ten_a"), "INTERNAL_USER_WRITE", "ten_b"),
    (error: unknown) => {
      const apiError = asApiError(error);
      assert.equal(apiError.statusCode, 403);
      assert.equal(apiError.code, "FORBIDDEN");
      return true;
    }
  );
});

test("authorizeOrgAction allows org_viewer on read actions and denies on write actions", () => {
  assert.doesNotThrow(() => authorizeOrgAction(auth("org_viewer"), "ORG_COURSE_READ", "ten_1"));
  assert.doesNotThrow(() => authorizeOrgAction(auth("org_viewer"), "ORG_FORM_READ", "ten_1"));
  assert.doesNotThrow(() => authorizeOrgAction(auth("org_viewer"), "ORG_SUBMISSION_READ", "ten_1"));
  assert.doesNotThrow(() => authorizeOrgAction(auth("org_viewer"), "ORG_ASSET_READ", "ten_1"));
  assert.doesNotThrow(() => authorizeOrgAction(auth("org_viewer"), "ORG_AUDIT_READ", "ten_1"));
  assert.throws(
    () => authorizeOrgAction(auth("org_viewer"), "ORG_COURSE_WRITE", "ten_1"),
    (error: unknown) => {
      const apiError = asApiError(error);
      assert.equal(apiError.statusCode, 403);
      assert.equal(apiError.code, "FORBIDDEN");
      return true;
    }
  );
  assert.throws(
    () => authorizeOrgAction(auth("org_viewer"), "ORG_FORM_WRITE", "ten_1"),
    (error: unknown) => {
      const apiError = asApiError(error);
      assert.equal(apiError.statusCode, 403);
      assert.equal(apiError.code, "FORBIDDEN");
      return true;
    }
  );
});

test("authorizeOrgAction denies org_editor on ORG_SUBMISSION_WRITE and ORG_TENANT_SETTINGS_WRITE", () => {
  assert.throws(
    () => authorizeOrgAction(auth("org_editor"), "ORG_SUBMISSION_WRITE", "ten_1"),
    (error: unknown) => {
      const apiError = asApiError(error);
      assert.equal(apiError.statusCode, 403);
      assert.equal(apiError.code, "FORBIDDEN");
      return true;
    }
  );
  assert.throws(
    () => authorizeOrgAction(auth("org_editor"), "ORG_TENANT_SETTINGS_WRITE", "ten_1"),
    (error: unknown) => {
      const apiError = asApiError(error);
      assert.equal(apiError.statusCode, 403);
      assert.equal(apiError.code, "FORBIDDEN");
      return true;
    }
  );
});

test("authorizeOrgAction denies platform_support on INTERNAL write operations", () => {
  assert.throws(
    () => authorizeOrgAction(auth("platform_support", "ten_a"), "INTERNAL_TENANT_WRITE", "ten_b"),
    (error: unknown) => {
      const apiError = asApiError(error);
      assert.equal(apiError.statusCode, 403);
      assert.equal(apiError.code, "FORBIDDEN");
      return true;
    }
  );
  assert.throws(
    () => authorizeOrgAction(auth("platform_support", "ten_a"), "INTERNAL_USER_WRITE", "ten_b"),
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
