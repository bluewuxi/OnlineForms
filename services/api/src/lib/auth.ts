import { CognitoJwtVerifier } from "aws-jwt-verify";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb";
import { ApiError } from "./errors";
import {
  emitInvalidTokenMetric,
  emitMembershipDeniedMetric,
  logAuthAudit
} from "./authObservability";
import {
  AUTH_TABLE_NAME_DEFAULT,
  type MembershipStatus,
  authUserMembershipSk,
  authUserPk
} from "../../../../shared/src/authTable";

export type AuthRole = "org_admin" | "org_editor" | "platform_admin" | "internal_admin";

export type AuthContext = {
  userId: string;
  tenantId: string;
  role: AuthRole;
  claims: Record<string, unknown>;
};

type HeaderMap = Record<string, string | undefined> | undefined;
type AuthMode = "mock" | "cognito";
type RuntimeEnv = "local" | "test" | "stage" | "prod";
type CognitoTokenUse = "access" | "id";
type CognitoConfig = {
  userPoolId: string;
  clientId: string;
  tokenUse: CognitoTokenUse;
  cacheKey: string;
};
type AuthenticateOptions = {
  tenantIdHint?: string;
  requireMembership?: boolean;
  allowMissingTenantContext?: boolean;
};
type MembershipRecord = {
  tenantId: string;
  status: MembershipStatus;
  role: AuthRole;
};
type TokenVerifier = { verify: (token: string) => Promise<Record<string, unknown>> };

const allowedRoles = new Set<AuthRole>(["org_admin", "org_editor", "platform_admin", "internal_admin"]);
const allowedAuthModes = new Set<AuthMode>(["mock", "cognito"]);
const restrictedMockEnvironments = new Set<RuntimeEnv>(["stage", "prod"]);
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const authTableName = process.env.ONLINEFORMS_AUTH_TABLE ?? AUTH_TABLE_NAME_DEFAULT;

function pickHeader(headers: HeaderMap, key: string): string | undefined {
  if (!headers) return undefined;
  const hit = Object.entries(headers).find(
    ([name, value]) => name.toLowerCase() === key.toLowerCase() && typeof value === "string"
  );
  return hit?.[1];
}

function getBearerToken(headers: HeaderMap): string {
  const raw = pickHeader(headers, "authorization");
  if (!raw) {
    throw new ApiError(401, "UNAUTHORIZED", "Missing Authorization header.");
  }
  const match = raw.match(/^Bearer\s+(.+)$/i);
  if (!match?.[1]) {
    throw new ApiError(401, "UNAUTHORIZED", "Authorization header must use Bearer token.");
  }
  return match[1];
}

function toRole(value: unknown): AuthRole {
  if (typeof value !== "string" || !allowedRoles.has(value as AuthRole)) {
    throw new ApiError(403, "FORBIDDEN", "JWT does not contain an allowed role.");
  }
  return value as AuthRole;
}

function toStringClaim(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ApiError(403, "FORBIDDEN", `JWT missing required claim: ${field}.`);
  }
  return value;
}

function toOptionalStringClaim(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function pickFirstString(values: unknown[]): string | undefined {
  for (const value of values) {
    const parsed = toOptionalStringClaim(value);
    if (parsed) return parsed;
  }
  return undefined;
}

function fromMockHeaders(headers: HeaderMap, allowMissingTenantContext: boolean): AuthContext {
  const userId = pickHeader(headers, "x-user-id") ?? "mock-user";
  const role = toRole(pickHeader(headers, "x-role"));
  const tenantId = pickHeader(headers, "x-tenant-id");
  const resolvedTenantId =
    typeof tenantId === "string" && tenantId.trim().length > 0
      ? tenantId
      : allowMissingTenantContext && role === "internal_admin"
        ? "__internal__"
        : toStringClaim(tenantId, "x-tenant-id");

  return {
    userId,
    tenantId: resolvedTenantId,
    role,
    claims: {}
  };
}

function pickActiveTenantId(
  headers: HeaderMap,
  tenantIdHint: string | undefined,
  tenantIdClaim: string | undefined,
  role: AuthRole,
  allowMissingTenantContext: boolean
): string {
  const tenantFromHeader = pickHeader(headers, "x-tenant-id")?.trim();
  if (tenantFromHeader) return tenantFromHeader;
  if (tenantIdHint?.trim()) return tenantIdHint.trim();
  if (tenantIdClaim?.trim()) return tenantIdClaim.trim();
  if (allowMissingTenantContext && role === "internal_admin") return "__internal__";
  throw new ApiError(
    403,
    "FORBIDDEN",
    "Unable to resolve tenant context from request. Provide x-tenant-id or include a tenant claim."
  );
}

async function getMembership(userId: string, tenantId: string): Promise<MembershipRecord | null> {
  const out = await ddb.send(
    new GetCommand({
      TableName: authTableName,
      Key: {
        PK: authUserPk(userId),
        SK: authUserMembershipSk(tenantId)
      }
    })
  );
  const item = out.Item as Record<string, unknown> | undefined;
  if (!item) return null;
  const status = item.status;
  const role = item.role;
  if (
    typeof status !== "string" ||
    typeof role !== "string" ||
    !allowedRoles.has(role as AuthRole) ||
    (status !== "active" && status !== "invited" && status !== "suspended")
  ) {
    return null;
  }
  return {
    tenantId,
    status: status as MembershipStatus,
    role: role as AuthRole
  };
}

async function assertTenantMembership(role: AuthRole, userId: string, tenantId: string): Promise<void> {
  if (role === "platform_admin" || role === "internal_admin") return;
  const membershipLoader = testMembershipLoaderOverride ?? getMembership;
  const membership = await membershipLoader(userId, tenantId);
  if (!membership || membership.status !== "active") {
    emitMembershipDeniedMetric();
    logAuthAudit("auth_membership_denied", { userId, tenantId, role });
    throw new ApiError(
      403,
      "FORBIDDEN",
      "User does not have active membership for the requested tenant."
    );
  }
  logAuthAudit("auth_membership_granted", { userId, tenantId, role, membershipRole: membership.role });
}

let cachedVerifier: TokenVerifier | null = null;
let cachedVerifierConfigKey: string | null = null;
let testVerifierOverride: TokenVerifier | null = null;
let testMembershipLoaderOverride:
  | ((userId: string, tenantId: string) => Promise<MembershipRecord | null>)
  | null = null;

function getRuntimeEnv(): RuntimeEnv {
  const raw = (process.env.APP_ENV ?? process.env.NODE_ENV ?? "local").trim().toLowerCase();
  if (raw === "production") return "prod";
  if (raw === "development") return "local";
  if (raw === "local" || raw === "test" || raw === "stage" || raw === "prod") {
    return raw;
  }
  return "local";
}

function getAuthMode(): AuthMode {
  const raw = process.env.AUTH_MODE?.trim().toLowerCase();
  if (!raw || !allowedAuthModes.has(raw as AuthMode)) {
    throw new ApiError(
      500,
      "INTERNAL_ERROR",
      "Server auth is not configured: AUTH_MODE must be 'mock' or 'cognito'."
    );
  }
  return raw as AuthMode;
}

function getRequiredEnv(name: "COGNITO_USER_POOL_ID" | "COGNITO_CLIENT_ID"): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new ApiError(500, "INTERNAL_ERROR", `Server auth is not configured: ${name} is required.`);
  }
  return value;
}

function getTokenUse(): CognitoTokenUse {
  const tokenUse = process.env.COGNITO_TOKEN_USE?.trim().toLowerCase();
  if (tokenUse === "access" || tokenUse === "id") {
    return tokenUse;
  }
  throw new ApiError(
    500,
    "INTERNAL_ERROR",
    "Server auth is not configured: COGNITO_TOKEN_USE must be 'access' or 'id'."
  );
}

function readCognitoConfig(): CognitoConfig {
  const userPoolId = getRequiredEnv("COGNITO_USER_POOL_ID");
  const clientId = getRequiredEnv("COGNITO_CLIENT_ID");
  const tokenUse = getTokenUse();
  return {
    userPoolId,
    clientId,
    tokenUse,
    cacheKey: `${userPoolId}|${clientId}|${tokenUse}`
  };
}

function getVerifier() {
  if (testVerifierOverride) return testVerifierOverride;
  const config = readCognitoConfig();
  if (cachedVerifier && cachedVerifierConfigKey === config.cacheKey) {
    return cachedVerifier;
  }

  cachedVerifier = CognitoJwtVerifier.create({
    userPoolId: config.userPoolId,
    tokenUse: config.tokenUse,
    clientId: config.clientId
  }) as unknown as { verify: (token: string) => Promise<Record<string, unknown>> };
  cachedVerifierConfigKey = config.cacheKey;

  return cachedVerifier;
}

export const __authTestHooks = {
  setVerifierOverride(verifier: TokenVerifier | null): void {
    testVerifierOverride = verifier;
  },
  setMembershipLoaderOverride(
    loader: ((userId: string, tenantId: string) => Promise<MembershipRecord | null>) | null
  ): void {
    testMembershipLoaderOverride = loader;
  },
  reset(): void {
    testVerifierOverride = null;
    testMembershipLoaderOverride = null;
  }
};

export async function authenticateRequest(
  headers: HeaderMap,
  options: AuthenticateOptions = {}
): Promise<AuthContext> {
  const authMode = getAuthMode();
  const runtimeEnv = getRuntimeEnv();

  if (authMode === "mock") {
    if (restrictedMockEnvironments.has(runtimeEnv)) {
      throw new ApiError(
        500,
        "INTERNAL_ERROR",
        "Server auth is not configured: AUTH_MODE=mock is not allowed in stage/prod."
      );
    }
    const auth = fromMockHeaders(headers, options.allowMissingTenantContext === true);
    logAuthAudit("auth_authenticated", {
      mode: authMode,
      userId: auth.userId,
      tenantId: auth.tenantId,
      role: auth.role
    });
    return auth;
  }

  let payload: Record<string, unknown>;
  try {
    const token = getBearerToken(headers);
    const verifier = getVerifier();
    payload = await verifier.verify(token);
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.statusCode === 401) {
        emitInvalidTokenMetric();
        logAuthAudit("auth_invalid_token", { reason: error.message });
      }
      throw error;
    }
    emitInvalidTokenMetric();
    logAuthAudit("auth_invalid_token", { reason: "jwt_verification_failed" });
    throw new ApiError(401, "UNAUTHORIZED", "Invalid authentication token.");
  }

  const userId = toStringClaim(payload.sub, "sub");
  const tenantIdClaim = pickFirstString([
    payload["custom:defaultTenantId"],
    payload["custom:tenantId"],
    payload.tenantId
  ]);

  const roleClaim = pickFirstString([
    payload["custom:platformRole"],
    payload["custom:role"],
    payload.role,
    Array.isArray(payload["cognito:groups"]) ? payload["cognito:groups"][0] : undefined
  ]);

  const role = toRole(roleClaim);
  const tenantId = pickActiveTenantId(
    headers,
    options.tenantIdHint,
    tenantIdClaim,
    role,
    options.allowMissingTenantContext === true
  );
  if (options.requireMembership !== false) {
    await assertTenantMembership(role, userId, tenantId);
  }

  logAuthAudit("auth_authenticated", {
    mode: authMode,
    userId,
    tenantId,
    role,
    membershipChecked: options.requireMembership !== false
  });

  return {
    userId,
    tenantId,
    role,
    claims: payload as Record<string, unknown>
  };
}

export function requireAnyRole(auth: AuthContext, roles: AuthRole[]): void {
  if (!roles.includes(auth.role)) {
    throw new ApiError(403, "FORBIDDEN", "Role not allowed for this operation.");
  }
}

export function assertTenantAccess(auth: AuthContext, resourceTenantId: string): void {
  if (auth.role === "platform_admin") return;
  if (auth.tenantId !== resourceTenantId) {
    throw new ApiError(403, "FORBIDDEN", "Cross-tenant access is denied.");
  }
}
