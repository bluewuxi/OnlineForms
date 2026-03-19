import { CognitoJwtVerifier } from "aws-jwt-verify";
import { ApiError } from "./errors";

export type AuthRole = "org_admin" | "org_editor" | "platform_admin";

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

const allowedRoles = new Set<AuthRole>(["org_admin", "org_editor", "platform_admin"]);
const allowedAuthModes = new Set<AuthMode>(["mock", "cognito"]);
const restrictedMockEnvironments = new Set<RuntimeEnv>(["stage", "prod"]);

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

function fromMockHeaders(headers: HeaderMap): AuthContext {
  const userId = pickHeader(headers, "x-user-id") ?? "mock-user";
  const tenantId = pickHeader(headers, "x-tenant-id");
  const role = pickHeader(headers, "x-role");

  return {
    userId,
    tenantId: toStringClaim(tenantId, "x-tenant-id"),
    role: toRole(role),
    claims: {}
  };
}

let cachedVerifier: { verify: (token: string) => Promise<Record<string, unknown>> } | null = null;
let cachedVerifierConfigKey: string | null = null;

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

export async function authenticateRequest(headers: HeaderMap): Promise<AuthContext> {
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
    return fromMockHeaders(headers);
  }

  const token = getBearerToken(headers);
  const verifier = getVerifier();
  const payload = await verifier.verify(token);

  const userId = toStringClaim(payload.sub, "sub");
  const tenantId = toStringClaim(
    payload["custom:tenantId"] ?? payload.tenantId,
    "custom:tenantId|tenantId"
  );

  const roleClaim =
    payload["custom:role"] ??
    payload.role ??
    (Array.isArray(payload["cognito:groups"]) ? payload["cognito:groups"][0] : undefined);

  return {
    userId,
    tenantId,
    role: toRole(roleClaim),
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
