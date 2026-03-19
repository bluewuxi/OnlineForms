import test from "node:test";
import assert from "node:assert/strict";
import { ApiError } from "../services/api/src/lib/errors";
import { normalizeTenantProfilePatch } from "../services/api/src/lib/tenants";

test("normalizeTenantProfilePatch trims optional string fields and keeps booleans", () => {
  const out = normalizeTenantProfilePatch({
    description: "  Demo tenant description  ",
    isActive: false,
    homePageContent: "  Welcome to our school portal.  "
  });

  assert.deepEqual(out, {
    description: "Demo tenant description",
    isActive: false,
    homePageContent: "Welcome to our school portal."
  });
});

test("normalizeTenantProfilePatch converts blank strings to null", () => {
  const out = normalizeTenantProfilePatch({
    description: "   ",
    homePageContent: ""
  });

  assert.deepEqual(out, {
    description: null,
    homePageContent: null
  });
});

test("normalizeTenantProfilePatch throws validation error for invalid types", () => {
  assert.throws(
    () =>
      normalizeTenantProfilePatch({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        isActive: "yes" as any
      }),
    (error: unknown) => {
      assert.ok(error instanceof ApiError);
      assert.equal(error.statusCode, 400);
      assert.equal(error.code, "VALIDATION_ERROR");
      return true;
    }
  );
});
