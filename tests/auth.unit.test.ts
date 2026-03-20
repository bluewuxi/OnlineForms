import test from "node:test";
import assert from "node:assert/strict";
import {
  __authTestHooks,
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

function withAuthEnv(
  env: Partial<
    Record<
      "AUTH_MODE" | "APP_ENV" | "NODE_ENV" | "COGNITO_USER_POOL_ID" | "COGNITO_CLIENT_ID" | "COGNITO_TOKEN_USE",
      string | undefined
    >
  >
) {
  const old = {
    AUTH_MODE: process.env.AUTH_MODE,
    APP_ENV: process.env.APP_ENV,
    NODE_ENV: process.env.NODE_ENV,
    COGNITO_USER_POOL_ID: process.env.COGNITO_USER_POOL_ID,
    COGNITO_CLIENT_ID: process.env.COGNITO_CLIENT_ID,
    COGNITO_TOKEN_USE: process.env.COGNITO_TOKEN_USE
  };
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) {
      delete process.env[key];
      continue;
    }
    process.env[key] = value;
  }
  return () => {
    process.env.AUTH_MODE = old.AUTH_MODE;
    process.env.APP_ENV = old.APP_ENV;
    process.env.NODE_ENV = old.NODE_ENV;
    process.env.COGNITO_USER_POOL_ID = old.COGNITO_USER_POOL_ID;
    process.env.COGNITO_CLIENT_ID = old.COGNITO_CLIENT_ID;
    process.env.COGNITO_TOKEN_USE = old.COGNITO_TOKEN_USE;
  };
}

test("authenticateRequest uses mock headers when AUTH_MODE=mock", async () => {
  const restore = withAuthEnv({ AUTH_MODE: "mock", APP_ENV: "local" });
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
    restore();
  }
});

test("authenticateRequest rejects missing tenant in mock mode", async () => {
  const restore = withAuthEnv({ AUTH_MODE: "mock", APP_ENV: "local" });
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
    restore();
  }
});

test("authenticateRequest allows missing tenant for internal_admin when explicitly enabled", async () => {
  const restore = withAuthEnv({ AUTH_MODE: "mock", APP_ENV: "local" });
  try {
    const auth = await authenticateRequest(
      {
        "x-user-id": "usr_1",
        "x-role": "internal_admin"
      },
      { allowMissingTenantContext: true, requireMembership: false }
    );
    assert.equal(auth.userId, "usr_1");
    assert.equal(auth.role, "internal_admin");
    assert.equal(auth.tenantId, "__internal__");
  } finally {
    restore();
  }
});

test("authenticateRequest rejects missing bearer token in cognito mode", async () => {
  const restore = withAuthEnv({ AUTH_MODE: "cognito", APP_ENV: "stage" });
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
    restore();
  }
});

test("authenticateRequest rejects invalid AUTH_MODE", async () => {
  const restore = withAuthEnv({ AUTH_MODE: "unknown", APP_ENV: "local" });
  try {
    await assert.rejects(
      () => authenticateRequest({}),
      (error: unknown) => {
        const apiError = asApiError(error);
        assert.equal(apiError.statusCode, 500);
        assert.equal(apiError.code, "INTERNAL_ERROR");
        return true;
      }
    );
  } finally {
    restore();
  }
});

test("authenticateRequest blocks mock mode in stage/prod runtime", async () => {
  const restore = withAuthEnv({
    AUTH_MODE: "mock",
    APP_ENV: "stage",
    COGNITO_USER_POOL_ID: undefined
  });
  try {
    await assert.rejects(
      () =>
        authenticateRequest({
          "x-user-id": "usr_1",
          "x-tenant-id": "ten_1",
          "x-role": "org_admin"
        }),
      (error: unknown) => {
        const apiError = asApiError(error);
        assert.equal(apiError.statusCode, 500);
        assert.equal(apiError.code, "INTERNAL_ERROR");
        return true;
      }
    );
  } finally {
    restore();
  }
});

test("authenticateRequest validates required cognito verifier config", async () => {
  const restore = withAuthEnv({
    AUTH_MODE: "cognito",
    APP_ENV: "stage",
    COGNITO_USER_POOL_ID: "",
    COGNITO_CLIENT_ID: "",
    COGNITO_TOKEN_USE: "access"
  });
  try {
    await assert.rejects(
      () => authenticateRequest({ authorization: "Bearer token" }),
      (error: unknown) => {
        const apiError = asApiError(error);
        assert.equal(apiError.statusCode, 500);
        assert.equal(apiError.code, "INTERNAL_ERROR");
        return true;
      }
    );
  } finally {
    restore();
  }
});

test("authenticateRequest validates COGNITO_TOKEN_USE", async () => {
  const restore = withAuthEnv({
    AUTH_MODE: "cognito",
    APP_ENV: "stage",
    COGNITO_USER_POOL_ID: "ap-southeast-2_xxxxxxxx",
    COGNITO_CLIENT_ID: "example-client-id",
    COGNITO_TOKEN_USE: "refresh"
  });
  try {
    await assert.rejects(
      () => authenticateRequest({ authorization: "Bearer token" }),
      (error: unknown) => {
        const apiError = asApiError(error);
        assert.equal(apiError.statusCode, 500);
        assert.equal(apiError.code, "INTERNAL_ERROR");
        return true;
      }
    );
  } finally {
    restore();
  }
});

test("authenticateRequest rejects cognito request when active membership is missing", async () => {
  const restore = withAuthEnv({
    AUTH_MODE: "cognito",
    APP_ENV: "stage",
    COGNITO_USER_POOL_ID: "ap-southeast-2_xxxxxxxx",
    COGNITO_CLIENT_ID: "example-client-id",
    COGNITO_TOKEN_USE: "access"
  });
  __authTestHooks.setVerifierOverride({
    verify: async () => ({
      sub: "usr_1",
      "custom:tenantId": "ten_1",
      "custom:role": "org_admin"
    })
  });
  __authTestHooks.setMembershipLoaderOverride(async () => null);
  try {
    await assert.rejects(
      () => authenticateRequest({ authorization: "Bearer test-token" }),
      (error: unknown) => {
        const apiError = asApiError(error);
        assert.equal(apiError.statusCode, 403);
        assert.equal(apiError.code, "FORBIDDEN");
        return true;
      }
    );
  } finally {
    __authTestHooks.reset();
    restore();
  }
});

test("authenticateRequest uses tenant claim and allows active membership", async () => {
  const restore = withAuthEnv({
    AUTH_MODE: "cognito",
    APP_ENV: "stage",
    COGNITO_USER_POOL_ID: "ap-southeast-2_xxxxxxxx",
    COGNITO_CLIENT_ID: "example-client-id",
    COGNITO_TOKEN_USE: "access"
  });
  __authTestHooks.setVerifierOverride({
    verify: async () => ({
      sub: "usr_1",
      "custom:tenantId": "ten_1",
      "custom:role": "org_editor"
    })
  });
  __authTestHooks.setMembershipLoaderOverride(async (_userId, tenantId) => {
    if (tenantId !== "ten_1") return null;
    return { tenantId, status: "active", role: "org_editor" };
  });
  try {
    const auth = await authenticateRequest({ authorization: "Bearer test-token" });
    assert.equal(auth.userId, "usr_1");
    assert.equal(auth.tenantId, "ten_1");
    assert.equal(auth.role, "org_editor");
  } finally {
    __authTestHooks.reset();
    restore();
  }
});

test("authenticateRequest rejects org role when tenant claim is missing in cognito mode", async () => {
  const restore = withAuthEnv({
    AUTH_MODE: "cognito",
    APP_ENV: "stage",
    COGNITO_USER_POOL_ID: "ap-southeast-2_xxxxxxxx",
    COGNITO_CLIENT_ID: "example-client-id",
    COGNITO_TOKEN_USE: "access"
  });
  __authTestHooks.setVerifierOverride({
    verify: async () => ({
      sub: "usr_1",
      "custom:role": "org_admin"
    })
  });
  try {
    await assert.rejects(
      () => authenticateRequest({ authorization: "Bearer test-token" }),
      (error: unknown) => {
        const apiError = asApiError(error);
        assert.equal(apiError.statusCode, 403);
        assert.equal(apiError.code, "FORBIDDEN");
        assert.match(apiError.message, /custom:tenantId/i);
        return true;
      }
    );
  } finally {
    __authTestHooks.reset();
    restore();
  }
});

test("authenticateRequest rejects x-tenant-id override when it mismatches tenant claim", async () => {
  const restore = withAuthEnv({
    AUTH_MODE: "cognito",
    APP_ENV: "stage",
    COGNITO_USER_POOL_ID: "ap-southeast-2_xxxxxxxx",
    COGNITO_CLIENT_ID: "example-client-id",
    COGNITO_TOKEN_USE: "access"
  });
  __authTestHooks.setVerifierOverride({
    verify: async () => ({
      sub: "usr_1",
      "custom:tenantId": "ten_claim",
      "custom:role": "org_editor"
    })
  });
  try {
    await assert.rejects(
      () =>
        authenticateRequest({
          authorization: "Bearer test-token",
          "x-tenant-id": "ten_other"
        }),
      (error: unknown) => {
        const apiError = asApiError(error);
        assert.equal(apiError.statusCode, 403);
        assert.equal(apiError.code, "FORBIDDEN");
        assert.match(apiError.message, /Tenant mismatch/i);
        return true;
      }
    );
  } finally {
    __authTestHooks.reset();
    restore();
  }
});

test("authenticateRequest rejects tenantIdHint mismatch against tenant claim", async () => {
  const restore = withAuthEnv({
    AUTH_MODE: "cognito",
    APP_ENV: "stage",
    COGNITO_USER_POOL_ID: "ap-southeast-2_xxxxxxxx",
    COGNITO_CLIENT_ID: "example-client-id",
    COGNITO_TOKEN_USE: "access"
  });
  __authTestHooks.setVerifierOverride({
    verify: async () => ({
      sub: "usr_1",
      "custom:tenantId": "ten_claim",
      "custom:role": "org_admin"
    })
  });
  try {
    await assert.rejects(
      () =>
        authenticateRequest(
          { authorization: "Bearer test-token" },
          { tenantIdHint: "ten_other" }
        ),
      (error: unknown) => {
        const apiError = asApiError(error);
        assert.equal(apiError.statusCode, 403);
        assert.equal(apiError.code, "FORBIDDEN");
        assert.match(apiError.message, /Tenant mismatch/i);
        return true;
      }
    );
  } finally {
    __authTestHooks.reset();
    restore();
  }
});

test("authenticateRequest allows internal_admin without tenant claim only when explicitly enabled", async () => {
  const restore = withAuthEnv({
    AUTH_MODE: "cognito",
    APP_ENV: "stage",
    COGNITO_USER_POOL_ID: "ap-southeast-2_xxxxxxxx",
    COGNITO_CLIENT_ID: "example-client-id",
    COGNITO_TOKEN_USE: "access"
  });
  __authTestHooks.setVerifierOverride({
    verify: async () => ({
      sub: "usr_1",
      "custom:role": "internal_admin"
    })
  });
  try {
    const auth = await authenticateRequest(
      { authorization: "Bearer test-token" },
      { allowMissingTenantContext: true, requireMembership: false }
    );
    assert.equal(auth.role, "internal_admin");
    assert.equal(auth.tenantId, "__internal__");
  } finally {
    __authTestHooks.reset();
    restore();
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
