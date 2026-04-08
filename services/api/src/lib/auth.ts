import { CognitoJwtVerifier } from "aws-jwt-verify";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb";
import { ApiError } from "./errors";
import {
  emitExpiredTokenMetric,
  emitInvalidTokenMetric,
  emitMalformedTokenMetric,
  emitMembershipDeniedMetric,
  logAuthAudit
} from "./authObservability";
import {
  AUTH_TABLE_NAME_DEFAULT,
  type MembershipStatus,
  authUserMembershipSk,
  authUserPk
} from "../../../../shared/src/authTable";

export type AuthRole = "org_viewer" | "org_editor" | "org_admin" | "platform_support" | "internal_admin";

export type AuthContext = {
  userId: string;
  tenantId: string;
  role: AuthRole;
  email: string | null;
  emailVerified: boolean;
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
  allowedRoles?: AuthRole[];
};
type TokenVerifier = { verify: (token: string) => Promise<Record<string, unknown>> };

const allowedRoles = new Set<AuthRole>(["org_viewer", "org_editor", "org_admin", "platform_support", "internal_admin"]);
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
    throw new ApiError(401, "UNAUTHORIZED", "Missing Authorization header.", [
      { issue: "token_missing" }
    ]);
  }
  const match = raw.match(/^Bearer\s+(.+)$/i);
  if (!match?.[1]) {
    throw new ApiError(401, "UNAUTHORIZED", "Authorization header must use Bearer token.", [
      { issue: "token_malformed" }
    ]);
  }
  return match[1];
}

function classifyTokenFailure(error: unknown): {
  message: string;
  issue: "token_expired" | "token_invalid";
} {
  const name = typeof error === "object" && error && "name" in error ? String(error.name) : "";
  const message =
    typeof error === "object" && error && "message" in error ? String(error.message) : "";
  const signature = `${name} ${message}`.toLowerCase();
  if (signature.includes("expir")) {
    return {
      message: "Authentication token has expired.",
      issue: "token_expired"
    };
  }
  return {
    message: "Invalid authentication token.",
    issue: "token_invalid"
  };
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

function toOptionalBooleanClaim(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
  }
  return undefined;
}

function pickFirstString(values: unknown[]): string | undefined {
  for (const value of values) {
    const parsed = toOptionalStringClaim(value);
    if (parsed) return parsed;
  }
  return undefined;
}

function claimMatchesRole(value: unknown, role: AuthRole): boolean {
  return typeof value === "string" && value.trim() === role;
}

function hasRoleCapabilityInPayload(payload: Record<string, unknown>, role: AuthRole): boolean {
  if (claimMatchesRole(payload["custom:platformRole"], role)) return true;
  if (claimMatchesRole(payload["custom:role"], role)) return true;
  if (claimMatchesRole(payload.role, role)) return true;
  const groups = payload["cognito:groups"];
  if (Array.isArray(groups)) {
    return groups.some((entry) => claimMatchesRole(entry, role));
  }
  return false;
}

function fromMockHeaders(headers: HeaderMap, allowMissingTenantContext: boolean): AuthContext {
  const userId = pickHeader(headers, "x-user-id") ?? "mock-user";
  const role = toRole(pickHeader(headers, "x-role"));
  const tenantId = pickHeader(headers, "x-tenant-id");
  const email = toOptionalStringClaim(pickHeader(headers, "x-user-email")) ?? null;
  const emailVerified = toOptionalBooleanClaim(pickHeader(headers, "x-email-verified")) ?? email !== null;
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
    email,
    emailVerified,
    claims: {}
  };
}

function pickActiveTenantIdForMock(
  headers: HeaderMap,
  tenantIdHint: string | undefined,
  role: AuthRole,
  allowMissingTenantContext: boolean
): string {
  const tenantFromHeader = pickHeader(headers, "x-tenant-id")?.trim();
  if (tenantFromHeader) return tenantFromHeader;
  if (tenantIdHint?.trim()) return tenantIdHint.trim();
  if (allowMissingTenantContext && role === "internal_admin") return "__internal__";
  throw new ApiError(
    403,
    "FORBIDDEN",
    "Unable to resolve tenant context from request. Provide x-tenant-id."
  );
}

function pickActiveTenantIdForCognito(
  headers: HeaderMap,
  tenantIdHint: string | undefined,
  tenantIdClaim: string | undefined,
  role: AuthRole,
  allowMissingTenantContext: boolean
): string {
  const tenantFromHeader = pickHeader(headers, "x-tenant-id")?.trim();
  const tenantFromHint = tenantIdHint?.trim();
  const claimTenant = tenantIdClaim?.trim();

  if (role === "internal_admin") {
    if (claimTenant) return claimTenant;
    if (tenantFromHeader) return tenantFromHeader;
    if (tenantFromHint) return tenantFromHint;
    if (allowMissingTenantContext) return "__internal__";
    throw new ApiError(403, "FORBIDDEN", "JWT missing required claim: custom:tenantId.");
  }

  if (!claimTenant) {
    if (tenantFromHeader) return tenantFromHeader;
    if (tenantFromHint) return tenantFromHint;
    if (allowMissingTenantContext) return "__unscoped__";
    throw new ApiError(403, "FORBIDDEN", "JWT missing required claim: custom:tenantId.");
  }

  if (tenantFromHeader && tenantFromHeader !== claimTenant) {
    throw new ApiError(
      403,
      "FORBIDDEN",
      "Tenant mismatch: x-tenant-id does not match authenticated tenant claim."
    );
  }
  if (tenantFromHint && tenantFromHint !== claimTenant) {
    throw new ApiError(
      403,
      "FORBIDDEN",
      "Tenant mismatch: route tenant context does not match authenticated tenant claim."
    );
  }

  return claimTenant;
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
  const allowedRolesRaw = item.allowedRoles;
  const membershipAllowedRoles =
    Array.isArray(allowedRolesRaw)
      ? allowedRolesRaw.filter(
          (value): value is AuthRole => typeof value === "string" && allowedRoles.has(value as AuthRole)
        )
      : undefined;
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
    role: role as AuthRole,
    allowedRoles: membershipAllowedRoles
  };
}

async function assertTenantMembership(role: AuthRole, userId: string, tenantId: string): Promise<void> {
  if (role === "platform_support" || role === "internal_admin") return;
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
  const allowedMembershipRoles =
    membership.allowedRoles && membership.allowedRoles.length > 0
      ? membership.allowedRoles
      : [membership.role];
  if (!allowedMembershipRoles.includes(role)) {
    emitMembershipDeniedMetric();
    logAuthAudit("auth_membership_denied", {
      userId,
      tenantId,
      role,
      membershipRole: membership.role,
      allowedRoles: allowedMembershipRoles
    });
    throw new ApiError(
      403,
      "FORBIDDEN",
      "User role is not allowed for the requested tenant membership."
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
  throw new ApiError(
    500,
    "INTERNAL_ERROR",
    "Server auth is not configured: APP_ENV must be one of local/test/stage/prod."
  );
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

export function hasTokenRoleCapability(
  claims: Record<string, unknown>,
  role: AuthRole
): boolean {
  return hasRoleCapabilityInPayload(claims, role);
}

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
    const authFromHeaders = fromMockHeaders(headers, options.allowMissingTenantContext === true);
    const tenantId = pickActiveTenantIdForMock(
      headers,
      options.tenantIdHint,
      authFromHeaders.role,
      options.allowMissingTenantContext === true
    );
    const auth: AuthContext = { ...authFromHeaders, tenantId };
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
        const issue = error.details?.[0]?.issue;
        if (issue === "token_malformed") {
          emitMalformedTokenMetric();
        } else {
          emitInvalidTokenMetric();
        }
        logAuthAudit("auth_invalid_token", { reason: error.message, issue });
      }
      throw error;
    }
    const classified = classifyTokenFailure(error);
    if (classified.issue === "token_expired") {
      emitExpiredTokenMetric();
    } else {
      emitInvalidTokenMetric();
    }
    logAuthAudit("auth_invalid_token", {
      reason: "jwt_verification_failed",
      issue: classified.issue
    });
    throw new ApiError(401, "UNAUTHORIZED", classified.message, [{ issue: classified.issue }]);
  }

  const userId = toStringClaim(payload.sub, "sub");
  const tenantIdClaim = pickFirstString([
    payload["custom:tenantId"],
    payload.tenantId
  ]);

  const roleClaim = pickFirstString([
    payload["custom:platformRole"],
    payload["custom:role"],
    payload.role,
    Array.isArray(payload["cognito:groups"]) ? payload["cognito:groups"][0] : undefined
  ]);
  const tokenRole = toRole(roleClaim);
  const requestedRoleRaw = pickHeader(headers, "x-role");
  const requestedRole = requestedRoleRaw ? toRole(requestedRoleRaw) : undefined;
  if (
    requestedRole &&
    (requestedRole === "platform_support" || requestedRole === "internal_admin") &&
    !hasRoleCapabilityInPayload(payload, requestedRole)
  ) {
    throw new ApiError(
      403,
      "FORBIDDEN",
      "Requested role is not allowed by authenticated token claims."
    );
  }
  const role = requestedRole ?? tokenRole;
  const tenantId = pickActiveTenantIdForCognito(
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
    tokenRole,
    membershipChecked: options.requireMembership !== false
  });

  return {
    userId,
    tenantId,
    role,
    email: toOptionalStringClaim(payload.email) ?? null,
    emailVerified: toOptionalBooleanClaim(payload.email_verified) ?? false,
    claims: payload as Record<string, unknown>
  };
}

export function requireAnyRole(auth: AuthContext, roles: AuthRole[]): void {
  if (!roles.includes(auth.role)) {
    throw new ApiError(403, "FORBIDDEN", "Role not allowed for this operation.");
  }
}

export function assertTenantAccess(auth: AuthContext, resourceTenantId: string): void {
  if (auth.role === "platform_support") return;
  if (auth.tenantId !== resourceTenantId) {
    throw new ApiError(403, "FORBIDDEN", "Cross-tenant access is denied.");
  }
}
